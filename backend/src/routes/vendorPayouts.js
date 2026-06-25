/**
 * Vendor Payouts Routes
 * GET  /vendors/wallet           — vendor views wallet balance
 * GET  /vendors/payouts          — vendor views payout history
 * PUT  /vendors/bank-details     — vendor saves bank details
 * GET  /admin/vendor-payouts     — admin lists all vendor payouts
 * PATCH /admin/vendor-payouts/:id/status — admin approves/rejects
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/supabase');
const { authenticate, authorize } = require('../middleware/auth');
const { revertVendorPayout } = require('../services/vendorPayoutService');

const router = express.Router();

// ─── Helper: resolve vendor id from user id ───────────────────────────────
const resolveVendorId = async (userId) => {
  const { data, error } = await supabase
    .from('vendors')
    .select('id')
    .eq('user_id', userId)
    .single();
  if (error || !data) throw new Error('Vendor not found');
  return data.id;
};

// ─── GET /vendors/wallet ──────────────────────────────────────────────────
router.get('/vendors/wallet', authenticate, authorize('vendor'), async (req, res) => {
  try {
    const vendorId = await resolveVendorId(req.user.id);

    const { data: wallet } = await supabase
      .from('vendor_wallets')
      .select('*')
      .eq('vendor_id', vendorId)
      .maybeSingle();

    res.json({
      wallet: wallet || {
        vendor_id:         vendorId,
        available_balance: 0,
        pending_balance:   0,
        lifetime_earnings: 0,
        total_orders:      0,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to fetch wallet' });
  }
});

// ─── GET /vendors/payouts ─────────────────────────────────────────────────
router.get('/vendors/payouts', authenticate, authorize('vendor'), async (req, res) => {
  try {
    const vendorId = await resolveVendorId(req.user.id);

    const { data: payouts, error } = await supabase
      .from('vendor_payouts')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('week_start', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ payouts: payouts || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to fetch payouts' });
  }
});

// ─── PUT /vendors/bank-details ────────────────────────────────────────────
const bankValidation = [
  body('bank_name').isString().trim().notEmpty().withMessage('Bank name is required'),
  body('account_holder').isString().trim().notEmpty().withMessage('Account holder is required'),
  body('account_number').isString().trim().notEmpty().withMessage('Account number is required'),
  body('branch_code').isString().trim().notEmpty().withMessage('Branch code is required'),
  body('account_type').isIn(['savings', 'cheque', 'current']).withMessage('Account type must be savings, cheque, or current'),
];

router.put('/vendors/bank-details', authenticate, authorize('vendor'), bankValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { bank_name, account_holder, account_number, branch_code, account_type } = req.body;

  try {
    const { data, error } = await supabase
      .from('vendors')
      .update({
        bank_name,
        account_holder,
        account_number,
        branch_code,
        account_type,
        bank_details_updated_at: new Date().toISOString(),
      })
      .eq('user_id', req.user.id)
      .select('bank_name, account_holder, account_number, branch_code, account_type, bank_details_updated_at')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ vendor: data });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save bank details' });
  }
});

// ─── GET /admin/vendor-payouts ────────────────────────────────────────────
router.get('/admin/vendor-payouts', authenticate, authorize('admin'), async (req, res) => {
  const { status } = req.query;

  try {
    let query = supabase
      .from('vendor_payouts')
      .select('*, vendors(business_name, phone)')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ payouts: data || [] });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch vendor payouts' });
  }
});

// ─── PATCH /admin/vendor-payouts/:id/status ───────────────────────────────
router.patch('/admin/vendor-payouts/:id/status', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  const { status, admin_notes } = req.body;

  const validStatuses = ['pending', 'approved', 'processing', 'paid', 'rejected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const { data: existing } = await supabase
      .from('vendor_payouts')
      .select('*')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Payout not found' });

    const updateData = {
      status,
      admin_notes: admin_notes || existing.admin_notes,
      updated_at:  new Date().toISOString(),
    };
    if (status === 'paid') updateData.paid_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('vendor_payouts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // If rejected, restore pending_balance
    if (status === 'rejected' && existing.status !== 'rejected') {
      await revertVendorPayout(id, existing.vendor_id, existing.total_amount);
    }

    res.json({ payout: data });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update payout status' });
  }
});

module.exports = router;
