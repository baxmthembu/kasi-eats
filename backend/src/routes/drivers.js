/**
 * Drivers Routes
 */
const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { supabase } = require('../config/supabase');
const { authenticate, authorize } = require('../middleware/auth');
const { acceptOffer, rejectOffer } = require('../services/dispatchService');
const { getRoute, getDeliveryRoute } = require('../services/routingService');
const { emitDriverStatus } = require('../websocket/handler');
const router = express.Router();

/**
 * GET /api/drivers/profile
 */
router.get('/profile', authenticate, authorize('driver'), async (req, res) => {
  const driverId = req.user.id;

  const { data: profile } = await supabase
    .from('driver_profiles')
    .select('*')
    .eq('user_id', driverId)
    .single();

  const { data: location } = await supabase
    .from('driver_locations')
    .select('is_online, latitude, longitude, updated_at')
    .eq('driver_id', driverId)
    .single();

  const { data: activeOrder } = await supabase
    .from('orders')
    .select('id, status, delivery_address, delivery_latitude, delivery_longitude, driver_payout, vendor_id, vendors(business_name, address, latitude, longitude)')
    .eq('driver_id', driverId)
    .not('status', 'eq', 'delivered')
    .not('status', 'eq', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  res.json({
    user: req.user,
    profile: profile || { wallet_balance: 0, rating: 5, total_deliveries: 0 },
    location: location || { is_online: false },
    activeOrder: activeOrder || null,
  });
});

/**
 * PATCH /api/drivers/status — toggle online + update location
 */
router.patch(
  '/status',
  authenticate,
  authorize('driver'),
  [
    body('is_online').optional().isBoolean(),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
    body('heading').optional().isFloat(),
    body('speed').optional().isFloat(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { is_online, latitude, longitude, heading, speed } = req.body;
    const driverId = req.user.id;
    const now = new Date().toISOString();

    const hasLocation = latitude != null && longitude != null;

    let data, error;

    if (hasLocation) {
      // Going online (or location update) — upsert so it works even if the row
      // doesn't exist yet (first time driver goes online).
      const upsertData = {
        driver_id: driverId,
        updated_at: now,
        latitude,
        longitude,
        last_latitude: latitude,
        last_longitude: longitude,
        last_location_at: now,
      };
      if (is_online !== undefined) upsertData.is_online = is_online;
      if (heading != null) upsertData.heading = heading;
      if (speed != null) upsertData.speed = speed;

      ({ data, error } = await supabase
        .from('driver_locations')
        .upsert(upsertData, { onConflict: 'driver_id' })
        .select()
        .single());
    } else {
      // Going offline (or status-only update) — UPDATE only, no lat/lng required.
      // The row must already exist (driver went online earlier).
      const updateData = { updated_at: now };
      if (is_online !== undefined) updateData.is_online = is_online;
      if (heading != null) updateData.heading = heading;
      if (speed != null) updateData.speed = speed;

      ({ data, error } = await supabase
        .from('driver_locations')
        .update(updateData)
        .eq('driver_id', driverId)
        .select()
        .single());

      // No row yet (driver never went online) — that's fine, nothing to update
      if (error?.code === 'PGRST116') {
        return res.json({ status: null });
      }
    }

    if (error) return res.status(400).json({ error: error.message });

    if (is_online !== undefined) {
      const io = req.app.get('io');
      emitDriverStatus(io, driverId, is_online);
    }

    res.json({ status: data });
  }
);

/**
 * PATCH /api/drivers/bank-details — save/update driver bank account details
 */
router.patch(
  '/bank-details',
  authenticate,
  authorize('driver'),
  [
    body('bank_name').trim().notEmpty().withMessage('Bank name is required').isLength({ max: 100 }),
    body('account_holder').trim().notEmpty().withMessage('Account holder name is required').isLength({ max: 255 }),
    body('account_number').trim().notEmpty().withMessage('Account number is required').isLength({ max: 50 }),
    body('branch_code').trim().notEmpty().withMessage('Branch code is required').isLength({ max: 20 }),
    body('account_type').trim().isIn(['savings', 'cheque', 'current']).withMessage('Account type must be savings, cheque, or current'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const driverId = req.user.id;
    const { bank_name, account_holder, account_number, branch_code, account_type } = req.body;

    const { data, error } = await supabase
      .from('driver_profiles')
      .upsert(
        {
          user_id: driverId,
          bank_name,
          account_holder,
          account_number,
          branch_code,
          account_type,
          bank_details_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select('bank_name, account_holder, account_number, branch_code, account_type, bank_details_updated_at')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json({ bankDetails: data });
  }
);

/**
 * POST /api/drivers/offers/:offerId/accept
 */
router.post('/offers/:offerId/accept', authenticate, authorize('driver'), async (req, res) => {
  const io = req.app.get('io');
  const result = await acceptOffer(io, req.params.offerId, req.user.id);

  if (!result.success) return res.status(400).json({ error: result.error });

  const { data: fullOrder } = await supabase
    .from('orders')
    .select('*, order_items(*), vendors(business_name, address, latitude, longitude)')
    .eq('id', result.order.id)
    .single();

  const { data: vendor } = await supabase
    .from('vendors')
    .select('user_id')
    .eq('id', result.order.vendor_id)
    .single();

  const { emitDeliveryAssigned, emitOrderStatus } = require('../websocket/handler');
  await emitDeliveryAssigned(io, result.order.customer_id, vendor?.user_id, fullOrder || result.order);
  await emitOrderStatus(
    io,
    result.order.customer_id,
    result.order.id,
    fullOrder?.status || result.order.status,
    {},
    vendor?.user_id
  );

  res.json({ order: fullOrder || result.order, offer: result.offer });
});

/**
 * POST /api/drivers/offers/:offerId/reject
 */
router.post('/offers/:offerId/reject', authenticate, authorize('driver'), async (req, res) => {
  const io = req.app.get('io');
  const result = await rejectOffer(io, req.params.offerId, req.user.id);
  res.json(result);
});

/**
 * GET /api/drivers/earnings?period=daily|weekly|all
 * Returns earnings list + summary stats for the driver app dashboard.
 */
router.get(
  '/earnings',
  authenticate,
  authorize('driver'),
  [query('period').optional().isIn(['daily', 'weekly', 'all'])],
  async (req, res) => {
    try {
      const { getEarningsSummary } = require('../services/earningsService');
      const period = req.query.period || 'daily';
      const result = await getEarningsSummary(req.user.id, period);
      res.json({ summary: result.summary, earnings: result.earnings, period });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch earnings' });
    }
  }
);

/**
 * GET /api/drivers/wallet
 * Returns the driver's full wallet breakdown.
 */
router.get('/wallet', authenticate, authorize('driver'), async (req, res) => {
  try {
    const { getDriverWallet } = require('../services/earningsService');
    const { getPayoutWeek }   = require('../services/payoutService');

    const [wallet, { weekStart, weekEnd }] = await Promise.all([
      getDriverWallet(req.user.id),
      Promise.resolve(getPayoutWeek()),
    ]);

    // Next payout date is always the coming Sunday
    const nextSunday = new Date();
    nextSunday.setDate(nextSunday.getDate() + (7 - nextSunday.getDay()) % 7 || 7);
    nextSunday.setHours(23, 0, 0, 0);

    res.json({
      wallet,
      currentWeek: { weekStart, weekEnd },
      nextPayoutDate: nextSunday.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch wallet' });
  }
});

/**
 * GET /api/drivers/payouts?limit=&offset=
 * Driver's own payout history.
 */
router.get(
  '/payouts',
  authenticate,
  authorize('driver'),
  [
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    const driverId = req.user.id;
    const limit  = Math.min(parseInt(req.query.limit  || '20', 10), 50);
    const offset = parseInt(req.query.offset || '0', 10);

    const { data: payouts, error } = await supabase
      .from('driver_payouts')
      .select('id, week_start, week_end, total_amount, distance_fee_total, tips_total, bonuses_total, commission_total, delivery_count, status, bank_name, account_number, admin_notes, processed_at, paid_at, created_at')
      .eq('driver_id', driverId)
      .order('week_start', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ payouts: payouts || [], offset, limit });
  }
);

/**
 * GET /api/drivers/history
 */
router.get('/history', authenticate, authorize('driver'), async (req, res) => {
  const driverId = req.user.id;
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
  const offset = parseInt(req.query.offset || '0', 10);

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, total, tip_amount, delivery_address, updated_at, vendors(business_name, address)')
    .eq('driver_id', driverId)
    .eq('status', 'delivered')
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });

  const orderIds = (orders || []).map((o) => o.id);

  // Fetch reviews + earnings in parallel
  const [reviewsResult, earningsResult] = await Promise.all([
    orderIds.length > 0
      ? supabase
          .from('reviews')
          .select('order_id, rating, comment')
          .in('order_id', orderIds)
          .eq('target_type', 'driver')
      : Promise.resolve({ data: [] }),
    orderIds.length > 0
      ? supabase
          .from('driver_earnings')
          .select('order_id, net_payout, distance_km, distance_fee, tip_amount, bonus_amount, platform_commission')
          .in('order_id', orderIds)
          .eq('driver_id', driverId)
      : Promise.resolve({ data: [] }),
  ]);

  const reviews  = reviewsResult.data  || [];
  const earnings = earningsResult.data || [];

  const ordersWithDetails = (orders || []).map((o) => ({
    ...o,
    review:   reviews.find((r) => r.order_id === o.id)  || null,
    earnings: earnings.find((e) => e.order_id === o.id) || null,
  }));

  res.json({ orders: ordersWithDetails, offset, limit });
});

/**
 * POST /api/drivers/push-token
 */
router.post(
  '/push-token',
  authenticate,
  authorize('driver'),
  [body('token').isString().notEmpty()],
  async (req, res) => {
    const { token } = req.body;
    const { error } = await supabase
      .from('driver_profiles')
      .update({ expo_push_token: token })
      .eq('user_id', req.user.id);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  }
);

/**
 * GET /api/drivers/route — OSRM route between two points
 */
router.get(
  '/route',
  authenticate,
  authorize('driver'),
  [
    query('fromLat').isFloat(),
    query('fromLng').isFloat(),
    query('toLat').isFloat(),
    query('toLng').isFloat(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { fromLat, fromLng, toLat, toLng } = req.query;
    const route = await getRoute(
      parseFloat(fromLat),
      parseFloat(fromLng),
      parseFloat(toLat),
      parseFloat(toLng)
    );
    res.json({ route });
  }
);

/**
 * GET /api/drivers/delivery-route — full two-leg route
 */
router.get(
  '/delivery-route',
  authenticate,
  authorize('driver'),
  [
    query('driverLat').isFloat(),
    query('driverLng').isFloat(),
    query('vendorLat').isFloat(),
    query('vendorLng').isFloat(),
    query('deliveryLat').isFloat(),
    query('deliveryLng').isFloat(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const route = await getDeliveryRoute(
      parseFloat(req.query.driverLat),
      parseFloat(req.query.driverLng),
      parseFloat(req.query.vendorLat),
      parseFloat(req.query.vendorLng),
      parseFloat(req.query.deliveryLat),
      parseFloat(req.query.deliveryLng)
    );
    res.json(route);
  }
);

/**
 * GET /api/drivers/heatmap — delivery density for dashboard overlay
 */
router.get('/heatmap', authenticate, authorize('driver'), async (req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: orders } = await supabase
    .from('orders')
    .select('delivery_latitude, delivery_longitude, vendors(latitude, longitude)')
    .eq('driver_id', req.user.id)
    .eq('status', 'delivered')
    .gte('created_at', thirtyDaysAgo);

  const points = (orders || []).flatMap((o) => {
    const pts = [];
    if (o.delivery_latitude && o.delivery_longitude) {
      pts.push({ lat: o.delivery_latitude, lng: o.delivery_longitude, type: 'dropoff' });
    }
    if (o.vendors?.latitude && o.vendors?.longitude) {
      pts.push({ lat: o.vendors.latitude, lng: o.vendors.longitude, type: 'pickup' });
    }
    return pts;
  });

  res.json({ points });
});

/**
 * PATCH /api/drivers/vehicle — update vehicle type and plate number
 */
router.patch(
  '/vehicle',
  authenticate,
  authorize('driver'),
  [
    body('vehicle_type').trim().isIn(['car', 'motorbike']).withMessage('vehicle_type must be car or motorbike'),
    body('plate_number').optional().trim().isLength({ max: 20 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { vehicle_type, plate_number } = req.body;
    const driverId = req.user.id;

    const updates = { vehicle_type };
    if (plate_number !== undefined) updates.plate_number = plate_number.trim();

    const { data, error } = await supabase
      .from('driver_profiles')
      .upsert({ user_id: driverId, ...updates }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ profile: data });
  }
);

module.exports = router;
