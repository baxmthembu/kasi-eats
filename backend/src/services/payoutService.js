/**
 * Payout Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates weekly payout records for all drivers with pending earnings.
 * Called by:
 *   - weeklyPayouts.js cron (every Sunday 23:00 SAST)
 *   - POST /api/admin/payouts/generate (manual admin trigger)
 *
 * Payout lifecycle:
 *   pending  → approved (admin reviews) → paid (EFT sent)
 *          ↘ rejected (admin rejects — earnings revert to pending)
 */
const { supabase } = require('../config/supabase');

/**
 * Return the Monday–Sunday week boundaries for a reference date.
 * When called on Sunday it returns the week that just ended.
 *
 * @param {Date} [ref=new Date()]
 * @returns {{ weekStart: string, weekEnd: string, startDate: Date, endDate: Date }}
 */
const getPayoutWeek = (ref = new Date()) => {
  const d = new Date(ref);
  const day = d.getDay(); // 0=Sun … 6=Sat

  // Last completed Sunday (end of period)
  const lastSunday = new Date(d);
  lastSunday.setDate(d.getDate() - day);
  lastSunday.setHours(23, 59, 59, 999);

  // Monday six days before that (start of period)
  const monday = new Date(lastSunday);
  monday.setDate(lastSunday.getDate() - 6);
  monday.setHours(0, 0, 0, 0);

  return {
    weekStart: monday.toISOString().split('T')[0],       // 'YYYY-MM-DD'
    weekEnd:   lastSunday.toISOString().split('T')[0],
    startDate: monday,
    endDate:   lastSunday,
  };
};

/**
 * Generate a weekly payout record for one driver.
 * Idempotent — safe to call multiple times for the same week.
 *
 * @param {string} driverId
 * @param {string} weekStart  'YYYY-MM-DD'
 * @param {string} weekEnd    'YYYY-MM-DD'
 * @returns {Object|null}     Payout record or null if nothing to pay
 */
const generateDriverPayout = async (driverId, weekStart, weekEnd) => {
  // ── Idempotency check ─────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('driver_payouts')
    .select('id, status, total_amount')
    .eq('driver_id', driverId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (existing) {
    console.log(`[payouts] Already exists for driver ${driverId.slice(0, 8)} week ${weekStart}`);
    return existing;
  }

  // ── Collect pending earnings for this week ────────────────────────────
  const start = new Date(weekStart); start.setHours(0, 0, 0, 0);
  const end   = new Date(weekEnd);   end.setHours(23, 59, 59, 999);

  const { data: earnings } = await supabase
    .from('driver_earnings')
    .select('id, net_payout, amount, delivery_fee_amount, distance_fee, tip_amount, bonus_amount, platform_commission')
    .eq('driver_id', driverId)
    .eq('status', 'pending')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  if (!earnings?.length) return null;

  // ── Aggregate ─────────────────────────────────────────────────────────
  const sum = (field) => earnings.reduce((s, e) => s + parseFloat(e[field] || 0), 0);

  const totalAmount      = sum('net_payout') || sum('amount');
  const deliveryFeeTotal = sum('delivery_fee_amount');
  const distanceFeeTotal = sum('distance_fee');
  const tipsTotal        = sum('tip_amount');
  const bonusesTotal     = sum('bonus_amount');
  const commissionTotal  = sum('platform_commission');

  if (totalAmount <= 0) return null;

  // ── Snapshot bank details at payout generation time ───────────────────
  // Stored so admin can process EFT even if driver changes details later
  const { data: profile } = await supabase
    .from('driver_profiles')
    .select('bank_name, account_holder, account_number, branch_code, account_type')
    .eq('user_id', driverId)
    .maybeSingle();

  // ── Create payout record ──────────────────────────────────────────────
  const { data: payout, error: payoutErr } = await supabase
    .from('driver_payouts')
    .insert({
      driver_id:          driverId,
      week_start:         weekStart,
      week_end:           weekEnd,
      total_amount:       Math.round(totalAmount      * 100) / 100,
      delivery_fee_total: Math.round(deliveryFeeTotal * 100) / 100,
      distance_fee_total: Math.round(distanceFeeTotal * 100) / 100,
      tips_total:         Math.round(tipsTotal        * 100) / 100,
      bonuses_total:      Math.round(bonusesTotal     * 100) / 100,
      commission_total:   Math.round(commissionTotal  * 100) / 100,
      delivery_count:     earnings.length,
      status:             'pending',
      // Bank snapshot
      bank_name:      profile?.bank_name      || null,
      account_holder: profile?.account_holder || null,
      account_number: profile?.account_number || null,
      branch_code:    profile?.branch_code    || null,
      account_type:   profile?.account_type   || null,
    })
    .select()
    .single();

  if (payoutErr) throw new Error(`[payouts] Insert failed: ${payoutErr.message}`);

  // ── Mark earnings as processed ────────────────────────────────────────
  await supabase
    .from('driver_earnings')
    .update({ status: 'processed', payout_id: payout.id })
    .in('id', earnings.map((e) => e.id));

  // ── Move pending → available in driver_wallets ────────────────────────
  const { data: wallet } = await supabase
    .from('driver_wallets')
    .select('pending_balance, available_balance')
    .eq('driver_id', driverId)
    .maybeSingle();

  if (wallet) {
    const moving    = Math.round(totalAmount * 100) / 100;
    const newPending = Math.max(0, Math.round((parseFloat(wallet.pending_balance) - moving) * 100) / 100);
    const newAvail   = Math.round((parseFloat(wallet.available_balance) + moving) * 100) / 100;

    await supabase
      .from('driver_wallets')
      .update({ pending_balance: newPending, available_balance: newAvail, updated_at: new Date().toISOString() })
      .eq('driver_id', driverId);
  }

  console.log(
    `[payouts] Created payout ${payout.id.slice(0, 8)} for driver ${driverId.slice(0, 8)}: R${payout.total_amount} (${earnings.length} deliveries)`
  );
  return payout;
};

/**
 * Run weekly payouts for ALL eligible drivers.
 * Called by cron job every Sunday at 23:00 SAST.
 *
 * @param {Object} io  Socket.IO server instance (for push notifications)
 * @returns {{ processed, totalPaid, weekStart, weekEnd }}
 */
const runWeeklyPayouts = async (io) => {
  const { weekStart, weekEnd, startDate, endDate } = getPayoutWeek();
  console.log(`[payouts] ─── Weekly run: ${weekStart} → ${weekEnd} ───`);

  // Find drivers with pending earnings in this week
  const { data: pendingRows } = await supabase
    .from('driver_earnings')
    .select('driver_id')
    .eq('status', 'pending')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  if (!pendingRows?.length) {
    console.log('[payouts] No pending earnings — nothing to do');
    return { processed: 0, totalPaid: 0, weekStart, weekEnd };
  }

  const driverIds = [...new Set(pendingRows.map((r) => r.driver_id))];
  console.log(`[payouts] Processing ${driverIds.length} driver(s)`);

  let processed = 0;
  let totalPaid = 0;

  for (const driverId of driverIds) {
    try {
      const payout = await generateDriverPayout(driverId, weekStart, weekEnd);
      if (payout && payout.total_amount) {
        processed++;
        totalPaid += parseFloat(payout.total_amount);

        // Notify driver in real time
        if (io) {
          const { emitPayoutProcessed } = require('../websocket/handler');
          emitPayoutProcessed(io, driverId, {
            payoutId:     payout.id,
            totalAmount:  payout.total_amount,
            weekStart:    payout.week_start,
            weekEnd:      payout.week_end,
            deliveries:   payout.delivery_count,
            status:       payout.status,
          });
        }
      }
    } catch (err) {
      console.error(`[payouts] Driver ${driverId.slice(0, 8)} failed:`, err.message);
    }
  }

  const result = {
    processed,
    totalPaid: Math.round(totalPaid * 100) / 100,
    weekStart,
    weekEnd,
  };
  console.log(`[payouts] ─── Done: ${processed} processed, R${result.totalPaid} total ───`);
  return result;
};

/**
 * Revert a rejected payout — move available balance back to pending
 * and reset earnings to 'pending' so they appear in the next run.
 */
const revertPayout = async (payoutId, driverId, totalAmount) => {
  // Revert earnings
  await supabase
    .from('driver_earnings')
    .update({ status: 'pending', payout_id: null })
    .eq('payout_id', payoutId);

  // Revert wallet
  const { data: wallet } = await supabase
    .from('driver_wallets')
    .select('pending_balance, available_balance')
    .eq('driver_id', driverId)
    .maybeSingle();

  if (wallet) {
    const amount = parseFloat(totalAmount) || 0;
    await supabase.from('driver_wallets').update({
      available_balance: Math.max(0, Math.round((parseFloat(wallet.available_balance) - amount) * 100) / 100),
      pending_balance:   Math.round((parseFloat(wallet.pending_balance) + amount) * 100) / 100,
      updated_at:        new Date().toISOString(),
    }).eq('driver_id', driverId);
  }
};

module.exports = {
  generateDriverPayout,
  runWeeklyPayouts,
  getPayoutWeek,
  revertPayout,
};
