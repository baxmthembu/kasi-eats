/**
 * Weekly Payout Cron Job
 * ─────────────────────────────────────────────────────────────────────────────
 * Schedule: every Sunday at 23:00 SAST (Africa/Johannesburg = UTC+2)
 *           cron string: "0 23 * * 0"  (node-cron uses server-local time)
 *
 * What it does:
 *  1. Finds all drivers with unprocessed (status='pending') earnings for the week
 *  2. Creates driver_payouts records with full breakdown
 *  3. Marks earnings as 'processed' and links to payout_id
 *  4. Moves pending_balance → available_balance in driver_wallets
 *  5. Pushes real-time notifications to online drivers via Socket.IO
 *
 * Admin then reviews pending payouts via GET /api/admin/payouts and
 * approves/rejects via PATCH /api/admin/payouts/:id
 *
 * Usage:
 *   const { registerPayoutCron } = require('./cron-jobs/weeklyPayouts');
 *   registerPayoutCron(io); // call once in server.js after io is created
 */
const cron = require('node-cron');
const { runWeeklyPayouts } = require('../src/services/payoutService');
const { processWeeklyVendorPayouts } = require('../src/services/vendorPayoutService');

/**
 * Register the Sunday-night weekly payout cron job.
 * @param {Object} io  - Socket.IO server instance
 * @returns {cron.ScheduledTask}
 */
const registerPayoutCron = (io) => {
  // Every Sunday at 23:00 (server local time — ensure TZ=Africa/Johannesburg in production)
  const job = cron.schedule('0 23 * * 0', async () => {
    console.log('\n[cron] ━━━ Weekly payout job triggered ━━━');
    try {
      const result = await runWeeklyPayouts(io);
      console.log(`[cron] Drivers: ${result.processed} payouts, R${result.totalPaid} | ${result.weekStart} → ${result.weekEnd}`);
      const vResult = await processWeeklyVendorPayouts();
      console.log(`[cron] Vendors: ${vResult.processed} payouts, R${vResult.totalPaid} | ${vResult.weekStart} → ${vResult.weekEnd}`);
    } catch (err) {
      console.error('[cron] Weekly payout FAILED:', err.message, err.stack);
    }
  });

  console.log('✅ Weekly payout cron registered (Sundays 23:00 server time)');
  return job;
};

module.exports = { registerPayoutCron };
