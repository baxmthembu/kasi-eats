/**
 * Admin Routes — Payout Management Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * All routes require: authenticate + authorize('admin')
 *
 * To create an admin user, set role='admin' directly in the DB:
 *   UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
 *
 * Endpoints:
 *   GET  /api/admin/payouts             — list all payouts (filterable)
 *   GET  /api/admin/payouts/analytics   — platform payout analytics
 *   GET  /api/admin/payouts/:id         — single payout detail
 *   PATCH /api/admin/payouts/:id        — approve | reject | mark paid
 *   POST /api/admin/payouts/generate    — manually trigger weekly generation
 *   GET  /api/admin/drivers             — all drivers with wallet summaries
 *   GET  /api/admin/drivers/:id/earnings — driver earnings detail
 */
const express = require('express');
const { query, body, param, validationResult } = require('express-validator');
const { supabase }          = require('../config/supabase');
const { authenticate, authorize } = require('../middleware/auth');
const { getPayoutWeek, revertPayout } = require('../services/payoutService');
const router = express.Router();

const adminOnly = [authenticate, authorize('admin')];

// ─── List payouts ──────────────────────────────────────────────────────────
router.get(
  '/payouts',
  ...adminOnly,
  [
    query('status').optional().isIn(['pending','approved','processing','paid','rejected']),
    query('week_start').optional().isDate(),
    query('driver_id').optional().isUUID(),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { status, week_start, driver_id, limit = 50, offset = 0 } = req.query;

    try {
      let q = supabase
        .from('driver_payouts')
        .select(`
          id, driver_id, week_start, week_end, total_amount,
          delivery_fee_total, distance_fee_total, tips_total, bonuses_total,
          commission_total, delivery_count, status,
          bank_name, account_holder, account_number, branch_code, account_type,
          admin_notes, processed_at, paid_at, created_at,
          users!driver_id ( name, email, phone )
        `)
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (status)     q = q.eq('status', status);
      if (week_start) q = q.eq('week_start', week_start);
      if (driver_id)  q = q.eq('driver_id', driver_id);

      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      res.json({ payouts: data || [] });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch payouts' });
    }
  }
);

// ─── Analytics ─────────────────────────────────────────────────────────────
router.get('/payouts/analytics', ...adminOnly, async (req, res) => {
  try {
    const { weekStart, weekEnd } = getPayoutWeek();
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);

    const [
      { data: pendingPayouts },
      { data: recentEarnings },
      { count: totalDrivers },
      { data: paidThisMonth },
    ] = await Promise.all([
      supabase.from('driver_payouts').select('id, total_amount, driver_id').eq('status', 'pending'),
      supabase.from('driver_earnings').select('net_payout, tip_amount, bonus_amount, platform_commission').gte('created_at', weekAgo.toISOString()),
      supabase.from('driver_profiles').select('*', { count: 'exact', head: true }),
      supabase.from('driver_payouts').select('total_amount').eq('status', 'paid').gte('paid_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ]);

    const pendingTotal   = (pendingPayouts  || []).reduce((s, p) => s + parseFloat(p.total_amount || 0), 0);
    const weeklyRevenue  = (recentEarnings  || []).reduce((s, e) => s + parseFloat(e.net_payout || 0), 0);
    const weeklyTips     = (recentEarnings  || []).reduce((s, e) => s + parseFloat(e.tip_amount || 0), 0);
    const weeklyBonuses  = (recentEarnings  || []).reduce((s, e) => s + parseFloat(e.bonus_amount || 0), 0);
    const weeklyCommission = (recentEarnings || []).reduce((s, e) => s + parseFloat(e.platform_commission || 0), 0);
    const monthlyPaid    = (paidThisMonth   || []).reduce((s, p) => s + parseFloat(p.total_amount || 0), 0);

    res.json({
      pendingPayouts:       pendingPayouts?.length || 0,
      pendingTotal:         Math.round(pendingTotal * 100) / 100,
      uniqueDriversPending: [...new Set((pendingPayouts || []).map(p => p.driver_id))].length,
      monthlyPaid:          Math.round(monthlyPaid * 100) / 100,
      totalActiveDrivers:   totalDrivers || 0,
      thisWeek: {
        deliveries:  recentEarnings?.length || 0,
        revenue:     Math.round(weeklyRevenue * 100) / 100,
        tips:        Math.round(weeklyTips * 100) / 100,
        bonuses:     Math.round(weeklyBonuses * 100) / 100,
        commission:  Math.round(weeklyCommission * 100) / 100,
      },
      currentWeek: { weekStart, weekEnd },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ─── Single payout ─────────────────────────────────────────────────────────
router.get('/payouts/:id', ...adminOnly, async (req, res) => {
  const { data: payout, error } = await supabase
    .from('driver_payouts')
    .select('*, users!driver_id(name, email, phone)')
    .eq('id', req.params.id)
    .single();

  if (error || !payout) return res.status(404).json({ error: 'Payout not found' });

  // Also fetch earnings that make up this payout
  const { data: earnings } = await supabase
    .from('driver_earnings')
    .select('id, net_payout, distance_km, tip_amount, bonus_amount, platform_commission, created_at, orders(id, delivery_address)')
    .eq('payout_id', req.params.id)
    .order('created_at', { ascending: false });

  res.json({ payout, earnings: earnings || [] });
});

// ─── Approve / Reject / Mark Paid ──────────────────────────────────────────
router.patch(
  '/payouts/:id',
  ...adminOnly,
  [
    param('id').isUUID(),
    body('status').isIn(['approved', 'rejected', 'paid']),
    body('admin_notes').optional().isString().trim().isLength({ max: 1000 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { status, admin_notes } = req.body;

    const { data: payout } = await supabase
      .from('driver_payouts')
      .select('id, status, driver_id, total_amount')
      .eq('id', req.params.id)
      .single();

    if (!payout) return res.status(404).json({ error: 'Payout not found' });
    if (payout.status === 'paid') return res.status(400).json({ error: 'Cannot change a paid payout' });

    const update = {
      status,
      admin_notes: admin_notes ?? null,
      updated_at:  new Date().toISOString(),
    };
    if (status === 'approved') update.processed_at = new Date().toISOString();
    if (status === 'paid')     update.paid_at       = new Date().toISOString();

    // On rejection — return earnings to pending + revert wallet
    if (status === 'rejected') {
      await revertPayout(req.params.id, payout.driver_id, payout.total_amount);
    }

    const { data: updated, error } = await supabase
      .from('driver_payouts')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Real-time push to driver
    const io = req.app.get('io');
    const { emitPayoutProcessed } = require('../websocket/handler');
    emitPayoutProcessed(io, payout.driver_id, {
      payoutId:    updated.id,
      totalAmount: updated.total_amount,
      weekStart:   updated.week_start,
      weekEnd:     updated.week_end,
      status:      updated.status,
      adminNotes:  updated.admin_notes,
    });

    res.json({ payout: updated });
  }
);

// ─── Manual trigger ────────────────────────────────────────────────────────
router.post('/payouts/generate', ...adminOnly, async (req, res) => {
  try {
    const io = req.app.get('io');
    const { runWeeklyPayouts } = require('../services/payoutService');
    const result = await runWeeklyPayouts(io);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Driver list with wallet summaries ────────────────────────────────────
router.get(
  '/drivers',
  ...adminOnly,
  [
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
    query('search').optional().isString().trim().isLength({ max: 100 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const limit  = Math.min(parseInt(req.query.limit  || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);

    try {
      const { data, error } = await supabase
        .from('driver_profiles')
        .select(`
          user_id, wallet_balance, rating, total_deliveries, vehicle_type,
          bank_name, account_holder, account_number, branch_code, account_type,
          users!user_id ( id, name, email, phone ),
          driver_wallets!driver_id ( available_balance, pending_balance, lifetime_earnings, total_deliveries )
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return res.status(500).json({ error: error.message });

      let results = data || [];
      const search = req.query.search?.toLowerCase();
      if (search) {
        results = results.filter(
          (d) => d.users?.name?.toLowerCase().includes(search) ||
                 d.users?.email?.toLowerCase().includes(search)
        );
      }

      res.json({ drivers: results, offset, limit });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch drivers' });
    }
  }
);

// ─── Driver earnings detail (for admin review) ─────────────────────────────
router.get(
  '/drivers/:driverId/earnings',
  ...adminOnly,
  [
    param('driverId').isUUID(),
    query('period').optional().isIn(['daily', 'weekly', 'all']),
  ],
  async (req, res) => {
    try {
      const { getEarningsSummary } = require('../services/earningsService');
      const period = req.query.period || 'weekly';
      const result = await getEarningsSummary(req.params.driverId, period);
      res.json({ summary: result.summary, earnings: result.earnings, period });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch driver earnings' });
    }
  }
);

module.exports = router;
