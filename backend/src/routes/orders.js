/**
 * Orders Routes
 * Place and manage orders
 */
const express = require('express');
const { body, validationResult, checkExact, param, query } = require('express-validator');
const { supabase } = require('../config/supabase');
const { authenticate, authorize } = require('../middleware/auth');
const { calculateOrderTotal, detectFraud } = require('../services/orderService');
const { offerToNearestDriver, creditDriverEarnings } = require('../services/dispatchService');
const { emitOrderStatus } = require('../websocket/handler');
const { enrichOrder } = require('../utils/orderEnrichment');
const { generateOrderNumber } = require('../utils/orderNumber');
const router = express.Router();

const orderValidation = [
  body('vendor_id').isString().trim().notEmpty().isLength({ max: 255 }).withMessage('Invalid vendor ID'),
  body('delivery_address').isString().trim().notEmpty().isLength({ max: 500 }).withMessage('Valid delivery address is required'),
  body('delivery_latitude').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('delivery_longitude').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  body('items').isArray({ min: 1, max: 50 }).withMessage('Order must contain 1-50 items'),
  body('items.*.id').isString().notEmpty().isLength({ max: 255 }),
  body('items.*.name').isString().notEmpty().isLength({ max: 255 }),
  body('items.*.quantity').isInt({ min: 1, max: 100 }),
  body('items.*.price').isFloat({ min: 0 }),
  body('special_instructions').optional().isString().trim().isLength({ max: 500 }),
  body('promotion_id').optional().isUUID(),
  body('combo_id').optional().isUUID(),
  body('tip_amount').optional().isFloat({ min: 0, max: 500 }).withMessage('Tip must be between R0 and R500'),
];

const VENDOR_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
};

const DRIVER_TRANSITIONS = {
  confirmed: ['picked_up'],
  ready_for_pickup: ['picked_up'],
  picked_up: ['on_the_way'],
  on_the_way: ['delivered'],
};

router.post('/', authenticate, authorize('customer'), checkExact(orderValidation), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    vendor_id,
    items,
    delivery_address,
    delivery_latitude,
    delivery_longitude,
    special_instructions,
    promotion_id,
    tip_amount: rawTip,
  } = req.body;
  const customerId = req.user.id;
  const tipAmount = Math.round((parseFloat(rawTip) || 0) * 100) / 100;

  try {
    const { subtotal, deliveryFee, total: baseTotal, discount, priceMap } = await calculateOrderTotal(
      items,
      15,
      promotion_id,
      vendor_id
    );
    const total = Math.round((baseTotal + tipAmount) * 100) / 100;

    const fraudCheck = await detectFraud(customerId, vendor_id, total);
    if (fraudCheck.isSuspicious) {
      console.warn(`Suspicious order from user ${customerId}:`, fraudCheck.flags);
    }

    const orderPayload = {
      customer_id: customerId,
      vendor_id,
      subtotal,
      delivery_fee: deliveryFee,
      total,
      delivery_address,
      delivery_latitude,
      delivery_longitude,
      special_instructions: special_instructions || null,
    };

    // These columns exist only after migration 004 — add them only if present
    // to avoid breaking installs that haven't run the migration yet.
    try { orderPayload.order_number = generateOrderNumber(); } catch {}
    if (tipAmount > 0) orderPayload.tip_amount = tipAmount;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select()
      .single();

    if (orderError) {
      console.error('[orders] Insert failed:', orderError);
      return res.status(500).json({ error: orderError.message || 'Failed to create order' });
    }

    // Use canonical prices from DB (priceMap) — never trust client-supplied price
    const orderItems = items.map((item) => ({
      order_id: order.id,
      menu_item_id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: priceMap[item.id],
      notes: item.notes || null,
    }));

    await supabase.from('order_items').insert(orderItems);

    // Store tip separately in order_tips for earnings tracking (table exists after migration 004)
    if (tipAmount > 0) {
      await supabase.from('order_tips').insert({
        order_id:    order.id,
        customer_id: customerId,
        amount:      tipAmount,
        status:      'pending',
      }).then(({ error }) => {
        if (error) console.warn('[orders] order_tips insert skipped (run migration 004):', error.message);
      });
    }

    res.status(201).json({
      order: { ...order, discount_applied: discount },
      // payment_url intentionally omits token — client appends its own JWT
      payment_url: `/api/payments/initiate?order_id=${order.id}`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Server error creating order' });
  }
});

router.get('/', authenticate, [
  query('status').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
], async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;
  const { status, limit = 50 } = req.query;

  try {
    let q = supabase
      .from('orders')
      .select('*, order_items(*), vendors(business_name, address, latitude, longitude)')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit, 10));

    if (status) q = q.eq('status', status);

    if (role === 'customer') q = q.eq('customer_id', userId);
    else if (role === 'driver') q = q.eq('driver_id', userId);
    else if (role === 'vendor') {
      const { data: vendor } = await supabase.from('vendors').select('id').eq('user_id', userId).single();
      if (vendor) q = q.eq('vendor_id', vendor.id);
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    res.json({ orders: data });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  const { data: order, error } = await supabase
    .from('orders')
    .select('*, order_items(*), vendors(business_name, address, latitude, longitude, user_id)')
    .eq('id', req.params.id)
    .single();

  if (error || !order) return res.status(404).json({ error: 'Order not found' });

  const role = req.user.role;
  const userId = req.user.id;
  if (role === 'customer' && order.customer_id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (role === 'driver' && order.driver_id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (role === 'vendor') {
    const { data: vendor } = await supabase.from('vendors').select('id').eq('user_id', userId).single();
    if (!vendor || order.vendor_id !== vendor.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const enriched = await enrichOrder(order);
  res.json({ order: enriched });
});

router.patch(
  '/:id/status',
  authenticate,
  [
    param('id').isUUID().withMessage('Invalid order ID'),
    body('status').isIn([
      'confirmed', 'preparing', 'ready_for_pickup',
      'picked_up', 'on_the_way', 'delivered', 'cancelled',
    ]),
    body('cancel_reason').optional().isString().trim().isLength({ max: 500 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { id } = req.params;
    const { status: newStatus, cancel_reason } = req.body;
    const userId = req.user.id;
    const role = req.user.role;

    try {
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('*, vendors(user_id, latitude, longitude)')
        .eq('id', id)
        .single();

      if (fetchError || !order) return res.status(404).json({ error: 'Order not found' });

      const currentStatus = order.status;
      const io = req.app.get('io');
      const vendorUserId = order.vendors?.user_id;

      if (role === 'vendor') {
        const allowed = VENDOR_TRANSITIONS[currentStatus];
        if (!allowed || !allowed.includes(newStatus)) {
          return res.status(400).json({ error: `Cannot transition from ${currentStatus} to ${newStatus}` });
        }
        const { data: vendor } = await supabase.from('vendors').select('id').eq('user_id', userId).single();
        if (!vendor || order.vendor_id !== vendor.id) {
          return res.status(403).json({ error: 'Not your order' });
        }
      } else if (role === 'driver') {
        const allowed = DRIVER_TRANSITIONS[currentStatus];
        if (!allowed || !allowed.includes(newStatus)) {
          return res.status(400).json({ error: `Cannot transition from ${currentStatus} to ${newStatus}` });
        }
        if (order.driver_id !== userId) {
          return res.status(403).json({ error: 'Not your delivery' });
        }
      } else {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const updatePayload = { status: newStatus };
      if (newStatus === 'cancelled' && role === 'vendor') {
        updatePayload.cancel_reason = cancel_reason || 'Vendor rejected';
        updatePayload.refund_needed = true;
      }

      const { data: updated, error: updateError } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', id)
        .select('*, order_items(*)')
        .single();

      if (updateError) return res.status(500).json({ error: 'Failed to update status' });

      await emitOrderStatus(io, order.customer_id, id, newStatus, {}, vendorUserId);

      if (role === 'vendor' && newStatus === 'ready_for_pickup') {
        await offerToNearestDriver(io, id);
      }

      if (role === 'driver' && newStatus === 'delivered') {
        // Pass io so earnings service can emit real-time wallet/bonus events
        await creditDriverEarnings(id, userId, io);
      }

      res.json({ order: updated });
    } catch (error) {
      res.status(500).json({ error: 'Server error updating status' });
    }
  }
);

module.exports = router;
