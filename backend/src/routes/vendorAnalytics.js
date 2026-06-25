/**
 * Vendor analytics and earnings
 */
const express = require('express');
const { query, validationResult } = require('express-validator');
const { supabase } = require('../config/supabase');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const periodStart = (period) => {
  const now = new Date();
  if (period === 'day') return new Date(now.setHours(0, 0, 0, 0)).toISOString();
  if (period === 'week') {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString();
};

router.get('/summary', authenticate, authorize('vendor'), [
  query('period').optional().isIn(['day', 'week', 'month']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const period = req.query.period || 'day';
  const since = periodStart(period);

  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, rating, total_reviews')
    .eq('user_id', req.user.id)
    .single();

  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  const { data: orders } = await supabase
    .from('orders')
    .select('id, total, status, created_at')
    .eq('vendor_id', vendor.id)
    .gte('created_at', since);

  const orderIds = (orders || []).map((o) => o.id);
  let revenue = 0;

  if (orderIds.length) {
    const { data: payments } = await supabase
      .from('payments')
      .select('vendor_payout, status')
      .in('order_id', orderIds)
      .eq('status', 'completed');

    revenue = (payments || []).reduce((s, p) => s + parseFloat(p.vendor_payout || 0), 0);
  }

  const activeOrders = (orders || []).filter(
    (o) => !['delivered', 'cancelled'].includes(o.status)
  ).length;

  const completedOrders = (orders || []).filter((o) => o.status === 'delivered').length;

  res.json({
    period,
    revenue: Math.round(revenue * 100) / 100,
    orderCount: orders?.length || 0,
    activeOrders,
    completedOrders,
    avgRating: vendor.rating,
    totalReviews: vendor.total_reviews,
  });
});

router.get('/top-items', authenticate, authorize('vendor'), async (req, res) => {
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('user_id', req.user.id)
    .single();

  const { data: vendorOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('vendor_id', vendor.id)
    .eq('status', 'delivered');

  const orderIds = (vendorOrders || []).map((o) => o.id);
  if (!orderIds.length) return res.json({ items: [] });

  const { data: items } = await supabase
    .from('order_items')
    .select('menu_item_id, name, quantity, price')
    .in('order_id', orderIds);

  const agg = {};
  (items || []).forEach((i) => {
    const key = i.menu_item_id || i.name;
    if (!agg[key]) agg[key] = { name: i.name, quantity: 0, revenue: 0 };
    agg[key].quantity += i.quantity;
    agg[key].revenue += i.price * i.quantity;
  });

  const sorted = Object.values(agg)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  res.json({ items: sorted });
});

router.get('/orders-breakdown', authenticate, authorize('vendor'), async (req, res) => {
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('user_id', req.user.id)
    .single();

  const { data: orders } = await supabase
    .from('orders')
    .select('status, created_at')
    .eq('vendor_id', vendor.id)
    .gte('created_at', periodStart('month'));

  const byStatus = {};
  const byHour = Array(24).fill(0);

  (orders || []).forEach((o) => {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    const h = new Date(o.created_at).getHours();
    byHour[h] += 1;
  });

  res.json({ byStatus, byHour });
});

router.get('/earnings', authenticate, authorize('vendor'), async (req, res) => {
  const from = req.query.from || periodStart('month');
  const to = req.query.to || new Date().toISOString();

  const { data: vendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('user_id', req.user.id)
    .single();

  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('vendor_id', vendor.id)
    .gte('created_at', from)
    .lte('created_at', to);

  const orderIds = (orders || []).map((o) => o.id);
  if (!orderIds.length) return res.json({ total: 0, transactions: [] });

  const { data: payments } = await supabase
    .from('payments')
    .select('*, orders(order_number, created_at)')
    .in('order_id', orderIds)
    .eq('status', 'completed')
    .order('paid_at', { ascending: false });

  const total = (payments || []).reduce((s, p) => s + parseFloat(p.vendor_payout || 0), 0);

  res.json({
    total: Math.round(total * 100) / 100,
    transactions: payments || [],
  });
});

module.exports = router;
