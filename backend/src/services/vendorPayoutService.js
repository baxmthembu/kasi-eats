/**
 * Vendor Payout Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates weekly payout records for all vendors with pending wallet balances.
 * Mirrors the driver payout pattern in payoutService.js.
 *
 * Payout lifecycle:
 *   pending  → approved (admin reviews) → paid (EFT sent)
 *          ↘ rejected (admin rejects — balance reverts to pending)
 */
const { supabase } = require('../config/supabase');

/**
 * Return the Monday–Sunday week boundaries for a reference date.
 * @param {Date} [ref=new Date()]
 * @returns {{ weekStart: string, weekEnd: string, startDate: Date, endDate: Date }}
 */
const getPayoutWeek = (ref = new Date()) => {
  const d = new Date(ref);
  const day = d.getDay();

  const lastSunday = new Date(d);
  lastSunday.setDate(d.getDate() - day);
  lastSunday.setHours(23, 59, 59, 999);

  const monday = new Date(lastSunday);
  monday.setDate(lastSunday.getDate() - 6);
  monday.setHours(0, 0, 0, 0);

  return {
    weekStart: monday.toISOString().split('T')[0],
    weekEnd:   lastSunday.toISOString().split('T')[0],
    startDate: monday,
    endDate:   lastSunday,
  };
};

/**
 * Generate a weekly payout record for one vendor.
 * Idempotent — safe to call multiple times for the same week.
 *
 * @param {string} vendorId
 * @param {string} weekStart  'YYYY-MM-DD'
 * @param {string} weekEnd    'YYYY-MM-DD'
 * @returns {Object|null}  Payout record or null if nothing to pay
 */
const generateVendorPayout = async (vendorId, weekStart, weekEnd) => {
  // Idempotency check
  const { data: existing } = await supabase
    .from('vendor_payouts')
    .select('id, status, total_amount')
    .eq('vendor_id', vendorId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (existing) {
    console.log(`[vendor-payouts] Already exists for vendor ${vendorId.slice(0, 8)} week ${weekStart}`);
    return existing;
  }

  // Fetch current wallet
  const { data: wallet } = await supabase
    .from('vendor_wallets')
    .select('pending_balance, total_orders')
    .eq('vendor_id', vendorId)
    .maybeSingle();

  const pendingBalance = parseFloat(wallet?.pending_balance || 0);
  if (pendingBalance <= 0) return null;

  // Snapshot bank details at payout generation time
  const { data: vendor } = await supabase
    .from('vendors')
    .select('bank_name, account_holder, account_number, branch_code, account_type')
    .eq('id', vendorId)
    .maybeSingle();

  const { data: payout, error } = await supabase
    .from('vendor_payouts')
    .insert({
      vendor_id:      vendorId,
      week_start:     weekStart,
      week_end:       weekEnd,
      total_amount:   Math.round(pendingBalance * 100) / 100,
      order_count:    wallet?.total_orders || 0,
      status:         'pending',
      bank_name:      vendor?.bank_name      || null,
      account_holder: vendor?.account_holder || null,
      account_number: vendor?.account_number || null,
      branch_code:    vendor?.branch_code    || null,
      account_type:   vendor?.account_type   || null,
    })
    .select()
    .single();

  if (error) throw new Error(`[vendor-payouts] Insert failed: ${error.message}`);

  // Zero out pending_balance in wallet
  await supabase
    .from('vendor_wallets')
    .update({
      pending_balance: 0,
      total_orders:    0,
      updated_at:      new Date().toISOString(),
    })
    .eq('vendor_id', vendorId);

  console.log(
    `[vendor-payouts] Created payout ${payout.id.slice(0, 8)} for vendor ${vendorId.slice(0, 8)}: R${payout.total_amount}`
  );
  return payout;
};

/**
 * Run weekly payouts for ALL eligible vendors.
 * Called by cron job every Sunday at 23:00 SAST.
 *
 * @returns {{ processed, totalPaid, weekStart, weekEnd }}
 */
const processWeeklyVendorPayouts = async () => {
  const { weekStart, weekEnd } = getPayoutWeek();
  console.log(`[vendor-payouts] ─── Weekly run: ${weekStart} → ${weekEnd} ───`);

  const { data: wallets } = await supabase
    .from('vendor_wallets')
    .select('vendor_id, pending_balance')
    .gt('pending_balance', 0);

  if (!wallets?.length) {
    console.log('[vendor-payouts] No pending balances — nothing to do');
    return { processed: 0, totalPaid: 0, weekStart, weekEnd };
  }

  console.log(`[vendor-payouts] Processing ${wallets.length} vendor(s)`);

  let processed = 0;
  let totalPaid = 0;

  for (const { vendor_id } of wallets) {
    try {
      const payout = await generateVendorPayout(vendor_id, weekStart, weekEnd);
      if (payout?.total_amount) {
        processed++;
        totalPaid += parseFloat(payout.total_amount);
      }
    } catch (err) {
      console.error(`[vendor-payouts] Vendor ${vendor_id.slice(0, 8)} failed:`, err.message);
    }
  }

  const result = {
    processed,
    totalPaid: Math.round(totalPaid * 100) / 100,
    weekStart,
    weekEnd,
  };
  console.log(`[vendor-payouts] ─── Done: ${processed} processed, R${result.totalPaid} total ───`);
  return result;
};

/**
 * Revert a rejected vendor payout — restore pending_balance.
 */
const revertVendorPayout = async (payoutId, vendorId, totalAmount) => {
  const amount = parseFloat(totalAmount) || 0;

  const { data: wallet } = await supabase
    .from('vendor_wallets')
    .select('pending_balance')
    .eq('vendor_id', vendorId)
    .maybeSingle();

  const currentPending = parseFloat(wallet?.pending_balance || 0);

  await supabase
    .from('vendor_wallets')
    .upsert(
      {
        vendor_id:       vendorId,
        pending_balance: Math.round((currentPending + amount) * 100) / 100,
        updated_at:      new Date().toISOString(),
      },
      { onConflict: 'vendor_id' }
    );
};

module.exports = {
  getPayoutWeek,
  generateVendorPayout,
  processWeeklyVendorPayouts,
  revertVendorPayout,
};
