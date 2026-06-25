/**
 * Payments Routes
 * PayFast integration
 */
const express = require('express');
const { supabase } = require('../config/supabase');
const { generatePaymentData, validateITN, calculateCommission } = require('../config/payfast');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

/**
 * HTML-escape values inserted into HTML attributes (defense-in-depth).
 */
const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#x27;');

/**
 * GET /api/payments/data?order_id=uuid
 * Returns signed PayFast payment fields as JSON.
 * Authenticated via Bearer token (axios interceptor adds it automatically).
 */
router.get('/data', authenticate, async (req, res) => {
  const { order_id } = req.query;
  if (!order_id) return res.status(400).json({ error: 'order_id is required' });

  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, users!customer_id(email, name)')
      .eq('id', order_id)
      .single();

    if (error || !order) return res.status(404).json({ error: 'Order not found' });
    if (order.customer_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const customer = { email: order.users.email, name: order.users.name };
    const { paymentUrl, paymentData } = generatePaymentData(order, customer);

    res.json({ paymentUrl, paymentData });
  } catch (err) {
    console.error('[payments] /data error:', err);
    res.status(500).json({ error: 'Failed to generate payment data' });
  }
});

/**
 * GET /api/payments/initiate  (kept for backward-compat, now unused)
 */
router.get('/initiate', authenticate, async (req, res) => {
  res.redirect(`/api/payments/data?order_id=${req.query.order_id}`);
});

/**
 * PayFast ITN Webhook
 * POST /api/payments/notify
 */
router.post('/notify', async (req, res) => {
  const pfData = req.body;

  try {
    const isValid = await validateITN(pfData);
    if (!isValid) return res.status(400).send('Invalid Signature');

    const orderId = pfData.m_payment_id;
    const amount = parseFloat(pfData.amount_gross);
    const status = pfData.payment_status === 'COMPLETE' ? 'completed' : 'failed';

    // Fetch order and verify amount matches — prevents under-payment attacks
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, total, customer_id, vendor_id, status, order_items(*)')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      console.error(`[ITN] Order not found: ${orderId}`);
      return res.status(404).send('Order not found');
    }

    if (Math.abs(amount - parseFloat(order.total)) > 0.01) {
      console.error(
        `[ITN] Amount mismatch for order ${orderId}: received R${amount}, expected R${order.total}`
      );
      return res.status(400).send('Amount mismatch');
    }

    // Idempotent ITN — skip duplicate completed notifications
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('status')
      .eq('order_id', orderId)
      .maybeSingle();

    if (existingPayment?.status === 'completed' && status === 'completed') {
      return res.status(200).send('OK');
    }

    const { commission, vendorPayout } = calculateCommission(amount);

    await supabase.from('payments').upsert(
      {
        order_id: orderId,
        amount,
        method: 'payfast',
        status,
        payfast_payment_id: pfData.pf_payment_id,
        commission,
        vendor_payout: vendorPayout,
        paid_at: new Date().toISOString(),
      },
      { onConflict: 'order_id' }
    );

    // Update order status if complete — notify vendor only after payment verified
    if (status === 'completed') {
      const paidAt = new Date().toISOString();

      const { data: updatedOrder } = await supabase
        .from('orders')
        .update({ status: 'confirmed', payment_confirmed_at: paidAt })
        .eq('id', orderId)
        .select('*, order_items(*)')
        .single();

      if (updatedOrder) {
        const io = req.app.get('io');
        const {
          emitNewOrder,
          emitOrderStatus,
          emitPaymentConfirmed,
        } = require('../websocket/handler');
        const { sendPushToVendor } = require('../services/notificationService');

        const { data: vendorData } = await supabase
          .from('vendors')
          .select('user_id, expo_push_token, business_name')
          .eq('id', updatedOrder.vendor_id)
          .single();

        if (vendorData) {
          await emitNewOrder(io, vendorData.user_id, updatedOrder);
          if (vendorData.expo_push_token) {
            await sendPushToVendor(vendorData.expo_push_token, {
              title: 'New paid order',
              body: `R${updatedOrder.total} — ${updatedOrder.order_number || updatedOrder.id.slice(0, 8)}`,
              data: { orderId: updatedOrder.id, type: 'new_order' },
            });
          }
        }

        // Credit vendor wallet with their 85% payout
        const { data: existingWallet } = await supabase
          .from('vendor_wallets')
          .select('pending_balance, lifetime_earnings, total_orders')
          .eq('vendor_id', updatedOrder.vendor_id)
          .maybeSingle();

        if (existingWallet) {
          await supabase
            .from('vendor_wallets')
            .update({
              pending_balance:   parseFloat(existingWallet.pending_balance)   + vendorPayout,
              lifetime_earnings: parseFloat(existingWallet.lifetime_earnings) + vendorPayout,
              total_orders:      existingWallet.total_orders + 1,
              updated_at:        new Date().toISOString(),
            })
            .eq('vendor_id', updatedOrder.vendor_id);
        } else {
          await supabase
            .from('vendor_wallets')
            .insert({
              vendor_id:         updatedOrder.vendor_id,
              pending_balance:   vendorPayout,
              lifetime_earnings: vendorPayout,
              total_orders:      1,
            });
        }

        emitPaymentConfirmed(io, updatedOrder.customer_id, updatedOrder);
        await emitOrderStatus(
          io,
          updatedOrder.customer_id,
          orderId,
          'confirmed',
          { message: 'Payment successful! Vendor is preparing your order.' },
          vendorData?.user_id
        );
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[ITN] Error:', error);
    res.status(500).send('Webhook Error');
  }
});

router.get('/return', (req, res) => {
  res.send('<h2>Payment Successful. You can close this window.</h2>');
});

router.get('/cancel', (req, res) => {
  res.send('<h2>Payment Cancelled. You can close this window.</h2>');
});

module.exports = router;
