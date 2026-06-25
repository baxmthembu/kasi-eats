/**
 * Earnings Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Calculates driver earnings on every completed delivery using:
 *  - Distance-based delivery fee tiers (Google Maps real route distance)
 *  - Platform commission (applied to delivery fee only)
 *  - Tips (100% to driver, no commission)
 *  - Configurable bonuses (peak hour, weekend, rain, streak, high-demand)
 *
 * Called from dispatchService.creditDriverEarnings() and orders route.
 */
const { supabase } = require('../config/supabase');
const { getRoute }  = require('./routingService');

// ─── Configuration (override via .env) ────────────────────────────────────
const PLATFORM_COMMISSION_RATE = parseFloat(process.env.PLATFORM_COMMISSION_RATE || '0.15'); // 15%

// Bonus amounts (ZAR) — configurable via env
const BONUS = {
  peak_hour:   parseFloat(process.env.BONUS_PEAK_HOUR   || '10'),
  weekend:     parseFloat(process.env.BONUS_WEEKEND     || '5'),
  rain:        parseFloat(process.env.BONUS_RAIN        || '15'),
  streak_5:    parseFloat(process.env.BONUS_STREAK_5    || '20'),
  streak_10:   parseFloat(process.env.BONUS_STREAK_10   || '40'),
  high_demand: parseFloat(process.env.BONUS_HIGH_DEMAND || '15'),
};

// ─── Distance-based fee tiers (ZAR) ───────────────────────────────────────
// Mirrors Uber Eats / DoorDash delivery fee structure for SA market
const getDistanceFee = (km) => {
  if (km <= 3)  return 20;          // 0–3 km = R20
  if (km <= 6)  return 30;          // 3–6 km = R30
  if (km <= 10) return 40;          // 6–10 km = R40
  return 40 + Math.ceil(km - 10) * 5; // +R5 per km beyond 10 km
};

// ─── Bonus detection ───────────────────────────────────────────────────────
const isPeakHour = () => {
  const h = new Date().getHours();
  // Morning rush 07–09, lunch 12–14, evening rush 17–20
  return (h >= 7 && h < 9) || (h >= 12 && h < 14) || (h >= 17 && h < 20);
};

const isWeekend = () => {
  const d = new Date().getDay();
  return d === 0 || d === 6; // Sunday=0, Saturday=6
};

/**
 * Compute all applicable bonuses for this delivery.
 * @returns {Array<{type, amount, reason}>}
 */
const calculateBonuses = async (driverId, orderId) => {
  const bonuses = [];

  if (isPeakHour()) {
    bonuses.push({ type: 'peak_hour', amount: BONUS.peak_hour, reason: 'Peak hour delivery' });
  }
  if (isWeekend()) {
    bonuses.push({ type: 'weekend', amount: BONUS.weekend, reason: 'Weekend delivery' });
  }

  // Streak bonuses — count today's completed deliveries (excluding current)
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const { count: todayCount } = await supabase
    .from('driver_earnings')
    .select('*', { count: 'exact', head: true })
    .eq('driver_id', driverId)
    .gte('created_at', todayMidnight.toISOString());

  const newTotal = (todayCount || 0) + 1; // +1 = this delivery

  if (newTotal === 5) {
    bonuses.push({ type: 'streak_5',  amount: BONUS.streak_5,  reason: '5-delivery streak today!' });
  } else if (newTotal === 10) {
    bonuses.push({ type: 'streak_10', amount: BONUS.streak_10, reason: '10-delivery streak today!' });
  }

  return bonuses;
};

// ─── Main function ─────────────────────────────────────────────────────────

/**
 * Calculate and persist earnings for a completed delivery.
 *
 * Called by: orders route (PATCH /:id/status when status = 'delivered')
 *
 * @param {string} orderId
 * @param {string} driverId
 * @param {object} io  - Socket.IO server (optional, for real-time push)
 * @returns {object}   Earnings breakdown or null if already credited
 */
const calculateAndCreditEarnings = async (orderId, driverId, io) => {
  // ── Idempotency guard — never double-credit the same delivery ─────────
  const { data: existing } = await supabase
    .from('driver_earnings')
    .select('id, net_payout')
    .eq('order_id', orderId)
    .eq('driver_id', driverId)
    .maybeSingle();

  if (existing) {
    console.warn(`[earnings] Already credited for order ${orderId} — skipping`);
    return null;
  }

  // ── Fetch order data ──────────────────────────────────────────────────
  const { data: order } = await supabase
    .from('orders')
    .select('delivery_fee, tip_amount, vendors(latitude, longitude)')
    .eq('id', orderId)
    .single();

  if (!order) throw new Error(`[earnings] Order ${orderId} not found`);

  // ── Fetch accepted delivery offer (has distance + coordinates) ────────
  const { data: offer } = await supabase
    .from('delivery_offers')
    .select('distance_km, vendor_lat, vendor_lng, delivery_lat, delivery_lng')
    .eq('order_id', orderId)
    .eq('driver_id', driverId)
    .eq('status', 'accepted')
    .maybeSingle();

  // ── Real route distance via Google Maps ───────────────────────────────
  // Priority: (1) stored offer.distance_km, (2) Google route, (3) fallback 0
  let distanceKm = parseFloat(offer?.distance_km || 0);

  if (!distanceKm && offer?.vendor_lat && offer?.delivery_lat) {
    try {
      const route = await getRoute(
        parseFloat(offer.vendor_lat),
        parseFloat(offer.vendor_lng),
        parseFloat(offer.delivery_lat),
        parseFloat(offer.delivery_lng)
      );
      distanceKm = route?.distanceKm || 0;
    } catch {
      console.warn('[earnings] Google route unavailable — using stored distance');
    }
  }

  // ── Tip ───────────────────────────────────────────────────────────────
  // Tip may be stored in order_tips OR in orders.tip_amount (both sources)
  const { data: tipRow } = await supabase
    .from('order_tips')
    .select('amount')
    .eq('order_id', orderId)
    .maybeSingle();

  const tipAmount = parseFloat(tipRow?.amount || order?.tip_amount || 0);

  // ── Distance fee & commission ─────────────────────────────────────────
  const distanceFee         = getDistanceFee(distanceKm);
  const platformCommission  = Math.round(distanceFee * PLATFORM_COMMISSION_RATE * 100) / 100;
  const deliveryFeeNet      = Math.round((distanceFee - platformCommission) * 100) / 100;

  // ── Bonuses ───────────────────────────────────────────────────────────
  const applicableBonuses = await calculateBonuses(driverId, orderId);
  const bonusAmount       = applicableBonuses.reduce((s, b) => s + b.amount, 0);

  // ── Net payout ────────────────────────────────────────────────────────
  // Commission on delivery fee only; tips + bonuses go 100% to driver
  const netPayout = Math.round((deliveryFeeNet + tipAmount + bonusAmount) * 100) / 100;

  // ── Persist earnings record ───────────────────────────────────────────
  const { data: earningRecord, error: earningErr } = await supabase
    .from('driver_earnings')
    .insert({
      driver_id:           driverId,
      order_id:            orderId,
      amount:              netPayout,       // legacy top-level field
      type:                'delivery_fee',
      delivery_fee_amount: distanceFee,
      distance_km:         distanceKm,
      distance_fee:        distanceFee,
      tip_amount:          tipAmount,
      bonus_amount:        bonusAmount,
      platform_commission: platformCommission,
      net_payout:          netPayout,
      status:              'pending',       // becomes 'processed' when weekly payout runs
    })
    .select()
    .single();

  if (earningErr) throw new Error(`[earnings] Failed to save record: ${earningErr.message}`);

  // ── Save bonus records ────────────────────────────────────────────────
  if (applicableBonuses.length > 0) {
    await supabase.from('driver_bonuses').insert(
      applicableBonuses.map((b) => ({
        driver_id:  driverId,
        order_id:   orderId,
        bonus_type: b.type,
        amount:     b.amount,
        reason:     b.reason,
        status:     'credited',
      }))
    );
  }

  // ── Mark tip as credited ──────────────────────────────────────────────
  if (tipAmount > 0 && tipRow) {
    await supabase
      .from('order_tips')
      .update({ driver_id: driverId, status: 'credited' })
      .eq('order_id', orderId);
  }

  // ── Update driver_wallets (new) ───────────────────────────────────────
  await upsertDriverWallet(driverId, { netPayout, tipAmount, bonusAmount });

  // ── Update legacy driver_profiles wallet_balance ──────────────────────
  // Keep this in sync so existing profile queries still work
  const { data: profile } = await supabase
    .from('driver_profiles')
    .select('wallet_balance, total_deliveries')
    .eq('user_id', driverId)
    .single();

  await supabase
    .from('driver_profiles')
    .upsert({
      user_id:          driverId,
      wallet_balance:   Math.round(((parseFloat(profile?.wallet_balance) || 0) + netPayout) * 100) / 100,
      total_deliveries: (profile?.total_deliveries || 0) + 1,
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'user_id' });

  // ── Real-time WebSocket push ──────────────────────────────────────────
  if (io) {
    try {
      const {
        emitEarningsUpdated,
        emitWalletUpdated,
        emitBonusEarned,
      } = require('../websocket/handler');

      const breakdown = { orderId, netPayout, distanceKm, distanceFee, tipAmount, bonusAmount, platformCommission };
      emitEarningsUpdated(io, driverId, breakdown);

      const wallet = await getDriverWallet(driverId);
      emitWalletUpdated(io, driverId, wallet);

      for (const bonus of applicableBonuses) {
        emitBonusEarned(io, driverId, { ...bonus, orderId });
      }
    } catch (wsErr) {
      console.warn('[earnings] WebSocket push failed (non-fatal):', wsErr.message);
    }
  }

  return {
    earningId:          earningRecord.id,
    netPayout,
    distanceKm,
    distanceFee,
    deliveryFeeNet,
    tipAmount,
    bonusAmount,
    platformCommission,
    bonuses:            applicableBonuses,
  };
};

// ─── Wallet helpers ────────────────────────────────────────────────────────

/**
 * Upsert driver_wallets row, incrementing all balance columns.
 */
const upsertDriverWallet = async (driverId, { netPayout = 0, tipAmount = 0, bonusAmount = 0 }) => {
  const { data: w } = await supabase
    .from('driver_wallets')
    .select('*')
    .eq('driver_id', driverId)
    .maybeSingle();

  if (w) {
    await supabase
      .from('driver_wallets')
      .update({
        pending_balance:   Math.round((parseFloat(w.pending_balance)   + netPayout)   * 100) / 100,
        lifetime_earnings: Math.round((parseFloat(w.lifetime_earnings) + netPayout)   * 100) / 100,
        total_tips:        Math.round((parseFloat(w.total_tips)        + tipAmount)   * 100) / 100,
        total_bonuses:     Math.round((parseFloat(w.total_bonuses)     + bonusAmount) * 100) / 100,
        total_deliveries:  (w.total_deliveries || 0) + 1,
        updated_at:        new Date().toISOString(),
      })
      .eq('driver_id', driverId);
  } else {
    await supabase.from('driver_wallets').insert({
      driver_id:         driverId,
      available_balance: 0,
      pending_balance:   netPayout,
      lifetime_earnings: netPayout,
      total_tips:        tipAmount,
      total_bonuses:     bonusAmount,
      total_deliveries:  1,
    });
  }
};

/**
 * Return wallet summary for a driver (creates default row if absent).
 */
const getDriverWallet = async (driverId) => {
  const { data } = await supabase
    .from('driver_wallets')
    .select('*')
    .eq('driver_id', driverId)
    .maybeSingle();

  return data || {
    driver_id:         driverId,
    available_balance: 0,
    pending_balance:   0,
    lifetime_earnings: 0,
    total_tips:        0,
    total_bonuses:     0,
    total_deliveries:  0,
  };
};

/**
 * Earnings stats for a given period (today / this week / all time).
 * Used by /api/drivers/earnings endpoint.
 */
const getEarningsSummary = async (driverId, period = 'weekly') => {
  let since;
  const now = new Date();

  if (period === 'daily') {
    since = new Date(now); since.setHours(0, 0, 0, 0);
  } else if (period === 'weekly') {
    since = new Date(now); since.setDate(now.getDate() - now.getDay()); since.setHours(0, 0, 0, 0);
  } else {
    // 'all' — no date filter
    since = null;
  }

  let q = supabase
    .from('driver_earnings')
    .select('id, net_payout, tip_amount, bonus_amount, distance_fee, platform_commission, distance_km, type, status, created_at, order_id')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false });

  if (since) q = q.gte('created_at', since.toISOString());

  const { data: earnings } = await q;
  const emptySummary = {
    summary: { total_net: 0, total_tips: 0, total_bonuses: 0, total_commission: 0, delivery_count: 0, avg_per_delivery: 0 },
    earnings: [],
  };
  if (!earnings?.length) return emptySummary;

  const total      = earnings.reduce((s, e) => s + parseFloat(e.net_payout || 0), 0);
  const tips       = earnings.reduce((s, e) => s + parseFloat(e.tip_amount  || 0), 0);
  const bonuses    = earnings.reduce((s, e) => s + parseFloat(e.bonus_amount || 0), 0);
  const commission = earnings.reduce((s, e) => s + parseFloat(e.platform_commission || 0), 0);

  return {
    summary: {
      total_net:        Math.round(total      * 100) / 100,
      total_tips:       Math.round(tips       * 100) / 100,
      total_bonuses:    Math.round(bonuses    * 100) / 100,
      total_commission: Math.round(commission * 100) / 100,
      delivery_count:   earnings.length,
      avg_per_delivery: earnings.length > 0 ? Math.round((total / earnings.length) * 100) / 100 : 0,
    },
    earnings,
  };
};

module.exports = {
  calculateAndCreditEarnings,
  upsertDriverWallet,
  getDriverWallet,
  getEarningsSummary,
  getDistanceFee,
  PLATFORM_COMMISSION_RATE,
};
