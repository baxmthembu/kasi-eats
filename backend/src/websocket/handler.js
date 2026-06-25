/**
 * WebSocket Handler
 * Real-time events for orders, driver tracking, and notifications
 */
const { supabase } = require('../config/supabase');
const { enrichOrder } = require('../utils/orderEnrichment');

const MAX_SPEED_KMH = 180;
const DRIVER_ARRIVAL_METERS = 100;
const ETA_THROTTLE_MS = 15000;
const lastEtaEmit = new Map();

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const validateLocationUpdate = async (driverId, latitude, longitude) => {
  const { data: loc } = await supabase
    .from('driver_locations')
    .select('last_latitude, last_longitude, last_location_at')
    .eq('driver_id', driverId)
    .single();

  if (!loc?.last_latitude || !loc?.last_location_at) return { valid: true };

  const timeDiffHours =
    (Date.now() - new Date(loc.last_location_at).getTime()) / (1000 * 60 * 60);
  if (timeDiffHours < 0.001) return { valid: true };

  const R = 6371;
  const dLat = ((latitude - loc.last_latitude) * Math.PI) / 180;
  const dLon = ((longitude - loc.last_longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((loc.last_latitude * Math.PI) / 180) *
      Math.cos((latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const speedKmh = distKm / timeDiffHours;

  if (speedKmh > MAX_SPEED_KMH) {
    console.warn(`Suspicious GPS speed for driver ${driverId}: ${speedKmh.toFixed(0)} km/h`);
    return { valid: false, reason: 'suspicious_speed' };
  }
  return { valid: true };
};

const getVendorUserIdForOrder = async (order) => {
  if (!order?.vendor_id) return null;
  const { data: vendor } = await supabase
    .from('vendors')
    .select('user_id')
    .eq('id', order.vendor_id)
    .single();
  return vendor?.user_id || null;
};

/**
 * JWT auth middleware for all Socket.IO namespaces.
 * Expects socket.handshake.auth.token = Supabase session access_token.
 */
const socketAuth = async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized'));
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return next(new Error('Unauthorized'));
    socket.verifiedUserId = user.id;
    next();
  } catch (err) {
    next(new Error('Unauthorized'));
  }
};

const setupWebSocket = (io) => {
  const ordersNs = io.of('/orders');
  ordersNs.use(socketAuth);
  ordersNs.on('connection', (socket) => {
    console.log(`📦 Order client connected: ${socket.id}`);

    socket.on('join', async ({ role }) => {
      // Use server-verified userId — never trust client-provided userId
      const userId = socket.verifiedUserId;
      socket.join(`user_${userId}`);
      if (role === 'vendor') {
        socket.join(`vendor_${userId}`);
        socket.vendorUserId = userId;

        const { data: vendor } = await supabase
          .from('vendors')
          .select('id')
          .eq('user_id', userId)
          .single();

        let activeOrders = [];
        if (vendor) {
          const { data: orders } = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('vendor_id', vendor.id)
            .not('status', 'eq', 'delivered')
            .not('status', 'eq', 'cancelled')
            .order('created_at', { ascending: false })
            .limit(20);
          activeOrders = orders || [];
        }

        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false);

        socket.emit('join_ack', {
          activeOrders,
          unreadNotifications: count || 0,
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`📦 Order client disconnected: ${socket.id}`);
    });
  });

  const driversNs = io.of('/drivers');
  driversNs.use(socketAuth);
  driversNs.on('connection', (socket) => {
    console.log(`🚗 Driver connected: ${socket.id}`);

    socket.on('join', async () => {
      // Use server-verified driver ID — never trust client-provided driverId
      const driverId = socket.verifiedUserId;
      socket.join(`driver_${driverId}`);
      socket.driverId = driverId;

      const { data: activeOrder } = await supabase
        .from('orders')
        .select('id, status, delivery_address, delivery_latitude, delivery_longitude, driver_payout')
        .eq('driver_id', driverId)
        .not('status', 'eq', 'delivered')
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: pendingOfferRow } = await supabase
        .from('delivery_offers')
        .select('*')
        .eq('driver_id', driverId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let pendingOffer = null;
      if (pendingOfferRow) {
        const { data: offerOrder } = await supabase
          .from('orders')
          .select('*')
          .eq('id', pendingOfferRow.order_id)
          .single();
        if (offerOrder) {
          const { buildOfferPayload } = require('../services/dispatchService');
          pendingOffer = await buildOfferPayload(pendingOfferRow, offerOrder);
        }
      }

      socket.emit('join_ack', {
        activeOrder: activeOrder || null,
        pendingOffer,
      });
    });

    socket.on('location_update', async ({ orderId, latitude, longitude, heading, speed }) => {
      // Reject spoofed driver ID — only the authenticated driver can emit their own location
      const driverId = socket.verifiedUserId;
      if (!driverId || latitude == null || longitude == null) return;

      const validation = await validateLocationUpdate(driverId, latitude, longitude);
      if (!validation.valid) return;

      await supabase.from('driver_locations').upsert(
        {
          driver_id: driverId,
          latitude,
          longitude,
          heading,
          speed,
          last_latitude: latitude,
          last_longitude: longitude,
          last_location_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'driver_id' }
      );

      const locationPayload = {
        driverId,
        latitude,
        longitude,
        heading,
        speed,
        timestamp: Date.now(),
      };

      if (orderId) {
        emitDriverLocation(io, orderId, locationPayload);

        const { data: order } = await supabase
          .from('orders')
          .select('id, status, vendor_id, driver_id')
          .eq('id', orderId)
          .single();

        if (order && ['picked_up', 'on_the_way', 'ready_for_pickup'].includes(order.status)) {
          const vendorUserId = await getVendorUserIdForOrder(order);
          if (vendorUserId) {
            const throttleKey = `${orderId}:${driverId}`;
            const last = lastEtaEmit.get(throttleKey) || 0;
            if (Date.now() - last >= ETA_THROTTLE_MS) {
              lastEtaEmit.set(throttleKey, Date.now());
              io.of('/orders').to(`vendor_${vendorUserId}`).emit('driver_eta', {
                orderId,
                ...locationPayload,
              });
            }

            const { data: vendor } = await supabase
              .from('vendors')
              .select('latitude, longitude')
              .eq('id', order.vendor_id)
              .single();

            if (vendor?.latitude && vendor?.longitude) {
              const dist = haversineMeters(
                latitude,
                longitude,
                vendor.latitude,
                vendor.longitude
              );
              if (dist <= DRIVER_ARRIVAL_METERS && order.status === 'ready_for_pickup') {
                io.of('/orders').to(`vendor_${vendorUserId}`).emit('driver_arrived', {
                  orderId,
                  driverId,
                  distanceMeters: Math.round(dist),
                });
              }
            }
          }
        }

        // Prune lastEtaEmit entries for delivered/cancelled orders to prevent memory leak
        if (order && ['delivered', 'cancelled'].includes(order.status)) {
          for (const key of lastEtaEmit.keys()) {
            if (key.startsWith(`${orderId}:`)) lastEtaEmit.delete(key);
          }
        }
      }
    });

    socket.on('disconnect', () => {
      console.log(`🚗 Driver disconnected: ${socket.id}`);
    });
  });

  const trackingNs = io.of('/tracking');
  trackingNs.use(socketAuth);
  trackingNs.on('connection', (socket) => {
    socket.on('track_order', ({ orderId }) => {
      socket.join(`order_${orderId}`);
    });
    socket.on('stop_tracking', ({ orderId }) => {
      socket.leave(`order_${orderId}`);
    });
  });

  // ─── Chat namespace (/chat) ───────────────────────────────────────────────
  const chatNs = io.of('/chat');
  chatNs.use(socketAuth);
  chatNs.on('connection', (socket) => {
    socket.on('join_chat', async ({ orderId }) => {
      const userId = socket.verifiedUserId;
      const { data: order } = await supabase
        .from('orders')
        .select('customer_id, driver_id')
        .eq('id', orderId)
        .single();
      if (!order) return;
      if (order.customer_id !== userId && order.driver_id !== userId) return;
      socket.join(`order_${orderId}`);
    });

    socket.on('call_request', ({ orderId, callerName, callerRole }) => {
      socket.to(`order_${orderId}`).emit('incoming_call', { orderId, callerName, callerRole });
    });

    socket.on('call_accepted', ({ orderId }) => {
      socket.to(`order_${orderId}`).emit('call_accepted', { orderId });
    });

    socket.on('call_declined', ({ orderId }) => {
      socket.to(`order_${orderId}`).emit('call_declined', { orderId });
    });

    socket.on('call_ended', ({ orderId }) => {
      socket.to(`order_${orderId}`).emit('call_ended', { orderId });
    });

    socket.on('disconnect', () => {
      console.log('💬 Chat client disconnected:', socket.id);
    });
  });

  console.log('✅ WebSocket namespaces initialized: /orders, /drivers, /tracking, /chat');
};

const emitNewOrder = async (io, vendorUserId, order) => {
  const payload = await enrichOrder(order);
  io.of('/orders').to(`vendor_${vendorUserId}`).emit('new_order', payload);
};

const emitOrderStatus = async (io, customerId, orderId, status, extra = {}, vendorUserId = null) => {
  const payload = { orderId, status, ...extra };
  io.of('/orders').to(`user_${customerId}`).emit('order_status', payload);
  const vUid = vendorUserId || (extra.vendorUserId ?? null);
  if (vUid) {
    io.of('/orders').to(`vendor_${vUid}`).emit('order_status', payload);
  }

  // Prune ETA map when order completes
  if (['delivered', 'cancelled'].includes(status)) {
    for (const key of lastEtaEmit.keys()) {
      if (key.startsWith(`${orderId}:`)) lastEtaEmit.delete(key);
    }
  }
};

const emitDeliveryRequest = (io, driverId, orderDetails) => {
  io.of('/drivers').to(`driver_${driverId}`).emit('delivery_request', orderDetails);
};

const emitOfferExpired = (io, driverId, payload) => {
  io.of('/drivers').to(`driver_${driverId}`).emit('offer_expired', payload);
};

const emitDriverLocation = (io, orderId, location) => {
  io.of('/tracking').to(`order_${orderId}`).emit('driver_location', location);
};

const emitDeliveryAssigned = async (io, customerId, vendorUserId, order) => {
  const payload = await enrichOrder(order);
  io.of('/orders').to(`user_${customerId}`).emit('delivery_assigned', payload);
  if (vendorUserId) {
    io.of('/orders').to(`vendor_${vendorUserId}`).emit('delivery_assigned', payload);
  }
};

const emitDriverStatus = (io, driverId, isOnline) => {
  io.of('/drivers').emit('driver_status', { driverId, isOnline });
};

const emitPaymentConfirmed = (io, customerId, order) => {
  io.of('/orders').to(`user_${customerId}`).emit('payment_confirmed', { order });
};

const emitPromotionUpdate = (io, vendorId, payload) => {
  io.of('/orders').emit('promotion_updated', { vendorId, ...payload });
};

const emitMenuUpdated = (io, vendorId, payload) => {
  io.of('/orders').emit('menu_updated', { vendorId, ...payload });
};

// ─── Earnings & Payout events ──────────────────────────────────────────────

/**
 * Push a real-time earning breakdown to the driver immediately after delivery.
 * Driver app shows "+R25.00" toast/notification.
 */
const emitEarningsUpdated = (io, driverId, breakdown) => {
  io.of('/drivers').to(`driver_${driverId}`).emit('earnings_updated', breakdown);
};

/**
 * Push updated wallet totals so the driver app refreshes balances instantly.
 */
const emitWalletUpdated = (io, driverId, wallet) => {
  io.of('/drivers').to(`driver_${driverId}`).emit('wallet_updated', wallet);
};

/**
 * Push a bonus notification (peak hour, streak, weekend, etc.).
 */
const emitBonusEarned = (io, driverId, bonus) => {
  io.of('/drivers').to(`driver_${driverId}`).emit('bonus_earned', bonus);
};

/**
 * Push a payout notification when a weekly payout record is generated or status changes.
 */
const emitPayoutProcessed = (io, driverId, payout) => {
  io.of('/drivers').to(`driver_${driverId}`).emit('payout_processed', payout);
};

module.exports = {
  setupWebSocket,
  emitNewOrder,
  emitOrderStatus,
  emitDeliveryRequest,
  emitOfferExpired,
  emitDriverLocation,
  emitDeliveryAssigned,
  emitDriverStatus,
  emitPaymentConfirmed,
  emitPromotionUpdate,
  emitMenuUpdated,
  emitEarningsUpdated,
  emitWalletUpdated,
  emitBonusEarned,
  emitPayoutProcessed,
  getVendorUserIdForOrder,
};
