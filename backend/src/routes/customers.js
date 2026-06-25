/**
 * Customer Routes — addresses, favorites, profile helpers
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/supabase');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate, authorize('customer'));

// ─── SAVED ADDRESSES ───────────────────────────────────────

router.get('/addresses', async (req, res) => {
  const { data, error } = await supabase
    .from('saved_addresses')
    .select('*')
    .eq('user_id', req.user.id)
    .order('is_default', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ addresses: data || [] });
});

router.post(
  '/addresses',
  [
    body('label').optional().isString().trim().isLength({ max: 50 }),
    body('address').isString().trim().notEmpty().isLength({ max: 500 }),
    body('latitude').isFloat({ min: -90, max: 90 }),
    body('longitude').isFloat({ min: -180, max: 180 }),
    body('is_default').optional().isBoolean(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { label, address, latitude, longitude, is_default } = req.body;

    if (is_default) {
      await supabase
        .from('saved_addresses')
        .update({ is_default: false })
        .eq('user_id', req.user.id);
    }

    const { data, error } = await supabase
      .from('saved_addresses')
      .insert({
        user_id: req.user.id,
        label: label || 'Home',
        address,
        latitude,
        longitude,
        is_default: is_default ?? false,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ address: data });
  }
);

router.delete('/addresses/:id', async (req, res) => {
  const { error } = await supabase
    .from('saved_addresses')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// ─── FAVORITE VENDORS ──────────────────────────────────────

router.get('/favorites/vendors', async (req, res) => {
  const { data, error } = await supabase
    .from('favorite_vendors')
    .select('*, vendors(*)')
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ favorites: (data || []).map((f) => f.vendors).filter(Boolean) });
});

router.post('/favorites/vendors/:vendorId', async (req, res) => {
  const { error } = await supabase.from('favorite_vendors').upsert(
    { user_id: req.user.id, vendor_id: req.params.vendorId },
    { onConflict: 'user_id,vendor_id' }
  );

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

router.delete('/favorites/vendors/:vendorId', async (req, res) => {
  await supabase
    .from('favorite_vendors')
    .delete()
    .eq('user_id', req.user.id)
    .eq('vendor_id', req.params.vendorId);
  res.json({ success: true });
});

// ─── FAVORITE ITEMS ────────────────────────────────────────

router.get('/favorites/items', async (req, res) => {
  const { data, error } = await supabase
    .from('favorite_items')
    .select('*, menu_items(*, vendors(business_name))')
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ favorites: data || [] });
});

router.post('/favorites/items/:itemId', async (req, res) => {
  const { error } = await supabase.from('favorite_items').upsert(
    { user_id: req.user.id, menu_item_id: req.params.itemId },
    { onConflict: 'user_id,menu_item_id' }
  );

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

router.delete('/favorites/items/:itemId', async (req, res) => {
  await supabase
    .from('favorite_items')
    .delete()
    .eq('user_id', req.user.id)
    .eq('menu_item_id', req.params.itemId);
  res.json({ success: true });
});

// ─── PROFILE UPDATE ────────────────────────────────────────

router.patch(
  '/profile',
  [
    body('name').optional().isString().trim().isLength({ min: 2, max: 100 }),
    body('phone').optional().isString().trim().isLength({ max: 20 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const updates = {};
    if (req.body.name  !== undefined) updates.name  = req.body.name.trim();
    if (req.body.phone !== undefined) updates.phone = req.body.phone.trim();

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select('id, name, email, phone')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ user: data });
  }
);

// ─── ORDER CANCELLATION ────────────────────────────────────
// Customer can cancel within 5 minutes of placing, while status is pending/confirmed

router.post(
  '/orders/:orderId/cancel',
  [body('reason').optional().isString().trim().isLength({ max: 300 })],
  async (req, res) => {
    const { orderId } = req.params;
    const reason = req.body.reason || 'Customer cancelled';

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, customer_id, status, created_at, driver_id')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' });
    if (order.customer_id !== req.user.id) return res.status(403).json({ error: 'Not your order' });

    const CANCELLABLE = ['pending', 'confirmed'];
    if (!CANCELLABLE.includes(order.status)) {
      return res.status(400).json({
        error: `Cannot cancel an order that is already ${order.status.replace(/_/g, ' ')}.`,
      });
    }

    // Enforce 5-minute cancellation window
    const ageMinutes = (Date.now() - new Date(order.created_at).getTime()) / 60000;
    if (ageMinutes > 5 && order.status === 'confirmed') {
      return res.status(400).json({
        error: 'Cancellation window has passed (5 minutes after confirming).',
      });
    }

    const { data: updated, error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'cancelled', cancel_reason: reason, refund_needed: true })
      .eq('id', orderId)
      .select()
      .single();

    if (updateErr) return res.status(500).json({ error: updateErr.message });
    res.json({ order: updated });
  }
);

module.exports = router;
