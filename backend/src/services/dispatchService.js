/**
 * Dispatch Service
 * Driver matching, offer lifecycle, accept/reject with race-condition protection
 */
const { supabase } = require('../config/supabase');
const { findNearestDriver } = require('./orderService');
const { calculateDistance } = require('./locationService');
const { emitDeliveryRequest, emitOfferExpired } = require('../websocket/handler');
const { sendPushToDriver } = require('./notificationService');

const OFFER_TIMEOUT_SEC = parseInt(process.env.DRIVER_OFFER_TIMEOUT_SEC || '30', 10);
const PAYOUT_SHARE = parseFloat(process.env.DRIVER_PAYOUT_SHARE || '0.80');
const MAX_ATTEMPTS = 3;
const SEARCH_RADIUS_KM = parseFloat(process.env.MAX_DRIVER_SEARCH_RADIUS_KM || '10');

/**
 * Build full offer payload for socket + API
 */
const buildOfferPayload = async (offer, order) => {
  const { data: vendor } = await supabase
    .from('vendors')
    .select('business_name, address, latitude, longitude')
    .eq('id', order.vendor_id)
    .single();

  const { data: items } = await supabase
    .from('order_items')
    .select('name, quantity, price')
    .eq('order_id', order.id);

  return {
    offerId: offer.id,
    orderId: order.id,
    vendorName: vendor?.business_name || 'Vendor',
    pickupAddress: vendor?.address || 'Pickup location',
    deliveryAddress: order.delivery_address,
    vendorLat: offer.vendor_lat,
    vendorLng: offer.vendor_lng,
    deliveryLat: offer.delivery_lat,
    deliveryLng: offer.delivery_lng,
    items: items || [],
    payoutAmount: offer.payout_amount,
    distanceKm: offer.distance_km,
    expiresAt: offer.expires_at,
    status: order.status,
  };
};

/**
 * Offer order to nearest available driver
 */
const offerToNearestDriver = async (io, orderId, excludeDriverIds = []) => {
  const { data: order, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .single();

  if (error || !order) return { success: false, reason: 'order_not_found' };
  if (order.driver_id) return { success: false, reason: 'already_assigned' };

  const { data: vendor } = await supabase
    .from('vendors')
    .select('latitude, longitude, business_name')
    .eq('id', order.vendor_id)
    .single();

  if (!vendor?.latitude || !vendor?.longitude) {
    return { success: false, reason: 'vendor_no_location' };
  }

  // Cancel any stale pending offers
  await supabase
    .from('delivery_offers')
    .update({ status: 'cancelled' })
    .eq('order_id', orderId)
    .eq('status', 'pending');

  const attemptCount = excludeDriverIds.length + 1;
  if (attemptCount > MAX_ATTEMPTS) {
    return { success: false, reason: 'max_attempts_reached' };
  }

  const nearest = await findNearestDriver(
    vendor.latitude,
    vendor.longitude,
    SEARCH_RADIUS_KM,
    excludeDriverIds
  );

  if (!nearest) return { success: false, reason: 'no_drivers_available' };

  const totalDistance =
    calculateDistance(
      nearest.latitude,
      nearest.longitude,
      vendor.latitude,
      vendor.longitude
    ) +
    calculateDistance(
      vendor.latitude,
      vendor.longitude,
      order.delivery_latitude,
      order.delivery_longitude
    );

  const payout = Math.round((order.delivery_fee || 15) * PAYOUT_SHARE * 100) / 100;
  const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_SEC * 1000).toISOString();

  const { data: offer, error: offerError } = await supabase
    .from('delivery_offers')
    .insert({
      order_id: orderId,
      driver_id: nearest.driver_id,
      status: 'pending',
      payout_amount: payout,
      distance_km: Math.round(totalDistance * 100) / 100,
      vendor_lat: vendor.latitude,
      vendor_lng: vendor.longitude,
      delivery_lat: order.delivery_latitude,
      delivery_lng: order.delivery_longitude,
      expires_at: expiresAt,
      attempt_number: attemptCount,
    })
    .select()
    .single();

  if (offerError) {
    console.error('Failed to create offer:', offerError.message);
    return { success: false, reason: 'offer_create_failed' };
  }

  // Set driver payout on order
  await supabase.from('orders').update({ driver_payout: payout }).eq('id', orderId);

  const payload = await buildOfferPayload(offer, order);
  if (io) {
    emitDeliveryRequest(io, nearest.driver_id, payload);
  }

  // Push notification backup when app is backgrounded
  const { data: profile } = await supabase
    .from('driver_profiles')
    .select('expo_push_token')
    .eq('user_id', nearest.driver_id)
    .single();

  if (profile?.expo_push_token) {
    await sendPushToDriver(profile.expo_push_token, {
      title: 'New Delivery Request',
      body: `${vendor.business_name} — R${payout.toFixed(2)} payout`,
      data: { offerId: offer.id, orderId },
    });
  }

  return { success: true, offer, driverId: nearest.driver_id };
};

/**
 * Accept offer atomically — only one driver wins
 */
const acceptOffer = async (io, offerId, driverId) => {
  const { data: offer, error: fetchError } = await supabase
    .from('delivery_offers')
    .select('*')
    .eq('id', offerId)
    .eq('driver_id', driverId)
    .single();

  if (fetchError || !offer) return { success: false, error: 'offer_not_found' };
  if (offer.status !== 'pending') return { success: false, error: 'offer_not_pending' };
  if (new Date(offer.expires_at) < new Date()) {
    return { success: false, error: 'offer_expired' };
  }

  // Atomic update — only succeeds if still pending and not expired
  const { data: updated, error: updateError } = await supabase
    .from('delivery_offers')
    .update({ status: 'accepted' })
    .eq('id', offerId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .select()
    .single();

  if (updateError || !updated) {
    return { success: false, error: 'offer_already_taken' };
  }

  // Assign driver to order (preserve vendor status e.g. ready_for_pickup)
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .update({ driver_id: driverId })
    .eq('id', offer.order_id)
    .is('driver_id', null)
    .select('*, order_items(*)')
    .single();

  if (orderError || !order) {
    // Rollback offer if order already assigned
    await supabase.from('delivery_offers').update({ status: 'cancelled' }).eq('id', offerId);
    return { success: false, error: 'order_already_assigned' };
  }

  // Cancel all other pending offers for this order
  await supabase
    .from('delivery_offers')
    .update({ status: 'cancelled' })
    .eq('order_id', offer.order_id)
    .neq('id', offerId)
    .eq('status', 'pending');

  const payload = await buildOfferPayload(updated, order);
  return { success: true, order, offer: payload };
};

/**
 * Reject offer and try next driver
 */
const rejectOffer = async (io, offerId, driverId) => {
  const { data: offer } = await supabase
    .from('delivery_offers')
    .select('*')
    .eq('id', offerId)
    .eq('driver_id', driverId)
    .single();

  if (!offer) return { success: false, error: 'offer_not_found' };

  await supabase
    .from('delivery_offers')
    .update({ status: 'rejected' })
    .eq('id', offerId);

  // Try next nearest driver
  const result = await offerToNearestDriver(io, offer.order_id, [driverId]);
  return { success: true, nextOffer: result };
};

/**
 * Expire pending offers and re-offer to next driver
 */
const expirePendingOffers = async (io) => {
  const now = new Date().toISOString();
  const { data: expired } = await supabase
    .from('delivery_offers')
    .select('*')
    .eq('status', 'pending')
    .lt('expires_at', now);

  if (!expired || expired.length === 0) return;

  for (const offer of expired) {
    await supabase
      .from('delivery_offers')
      .update({ status: 'expired' })
      .eq('id', offer.id);

    if (io) emitOfferExpired(io, offer.driver_id, { offerId: offer.id, orderId: offer.order_id });

    const { data: order } = await supabase
      .from('orders')
      .select('driver_id')
      .eq('id', offer.order_id)
      .single();

    if (!order?.driver_id) {
      await offerToNearestDriver(io, offer.order_id, [offer.driver_id]);
    }
  }
};

/**
 * Credit driver earnings on delivery completion.
 * Delegates to earningsService for full distance-based calculation,
 * commission, tips, bonuses, and wallet update.
 */
const creditDriverEarnings = async (orderId, driverId, io) => {
  try {
    const { calculateAndCreditEarnings } = require('./earningsService');
    const result = await calculateAndCreditEarnings(orderId, driverId, io);
    if (result) {
      console.log(`[dispatch] Credited R${result.netPayout} to driver ${driverId.slice(0, 8)} for order ${orderId.slice(0, 8)}`);
    }
    return result;
  } catch (err) {
    console.error('[dispatch] creditDriverEarnings failed:', err.message);
    // Non-fatal — delivery is still marked complete; earnings can be recalculated
  }
};

module.exports = {
  offerToNearestDriver,
  acceptOffer,
  rejectOffer,
  expirePendingOffers,
  creditDriverEarnings,
  buildOfferPayload,
};
