/**
 * PayFast payment routes.
 * The browser return URL is informational; only a verified ITN may confirm an order.
 */
const express = require('express');
const { supabase } = require('../config/supabase');
const {
  generatePaymentData,
  validateITN,
  calculateCommission,
} = require('../config/payfast');
const { authenticate } = require('../middleware/auth');
const { paymentWebhookLimiter } = require('../middleware/rateLimiter');
const {
  sendPaymentConfirmedEmail,
} = require('../services/paymentEmailService');

const router = express.Router();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getOrderRedirectUrl = (orderId, paymentState) => {
  const webAppUrl = process.env.WEB_APP_URL || 'http://localhost:3000';
  const baseUrl = new URL(webAppUrl);
  if (process.env.NODE_ENV === 'production' && baseUrl.protocol !== 'https:') {
    throw new Error('WEB_APP_URL must use HTTPS in production');
  }
  const safeOrderId = UUID_PATTERN.test(String(orderId || '')) ? orderId : '';
  const destination = safeOrderId
    ? `/orders/${encodeURIComponent(safeOrderId)}`
    : '/orders';
  const url = new URL(destination, baseUrl);
  url.searchParams.set('payment', paymentState);
  return url.toString();
};

/** GET /api/payments/data?order_id=uuid */
router.get('/data', authenticate, async (req, res) => {
  const { order_id: orderId } = req.query;
  if (!UUID_PATTERN.test(String(orderId || ''))) {
    return res.status(400).json({ error: 'A valid order_id is required' });
  }

  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, users!customer_id(email, name)')
      .eq('id', orderId)
      .single();

    if (error || !order) return res.status(404).json({ error: 'Order not found' });
    if (order.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (order.status !== 'pending' || order.payment_confirmed_at) {
      return res.status(409).json({ error: 'This order is not awaiting payment' });
    }

    const customer = { email: order.users?.email, name: order.users?.name };
    const { paymentUrl, paymentData } = generatePaymentData(order, customer);

    return res.json({
      paymentUrl,
      paymentData,
      environment: process.env.PAYFAST_SANDBOX === 'true' ? 'sandbox' : 'live',
    });
  } catch (error) {
    console.error('[payments] Payment data generation failed:', error.message);
    return res.status(500).json({ error: 'Payment is temporarily unavailable' });
  }
});

/** Kept for backward compatibility with existing mobile/API clients. */
router.get('/initiate', authenticate, (req, res) => {
  const query = new URLSearchParams({
    order_id: String(req.query.order_id || ''),
  });
  return res.redirect(`/api/payments/data?${query.toString()}`);
});

/** POST /api/payments/notify - PayFast ITN webhook. */
router.post('/notify', paymentWebhookLimiter, async (req, res) => {
  const pfData = req.body;

  try {
    const isValid = await validateITN(pfData, { requestIp: req.ip });
    if (!isValid) return res.status(400).send('Invalid notification');

    const orderId = String(pfData.m_payment_id || '');
    const amount = Number(pfData.amount_gross);
    if (!UUID_PATTERN.test(orderId) || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).send('Invalid payment details');
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, total, customer_id, vendor_id, status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error(`[ITN] Order not found: ${orderId}`);
      return res.status(404).send('Order not found');
    }

    if (Math.abs(amount - Number(order.total)) > 0.01) {
      console.error(`[ITN] Amount mismatch for order ${orderId}`);
      return res.status(400).send('Amount mismatch');
    }

    if (pfData.payment_status !== 'COMPLETE') {
      // Insert-only prevents a late failed notification from downgrading a
      // completed payment. Duplicate failures are safely ignored.
      const { error: failureError } = await supabase.from('payments').insert({
        order_id: orderId,
        amount,
        method: 'payfast',
        status: 'failed',
        payfast_payment_id: pfData.pf_payment_id || null,
        commission: 0,
        vendor_payout: 0,
        paid_at: null,
      });
      if (failureError && failureError.code !== '23505') throw failureError;
      return res.status(200).send('OK');
    }

    const paidAt = new Date().toISOString();
    const { commission, vendorPayout } = calculateCommission(amount);

    if (process.env.PAYFAST_ATOMIC_RPC_ENABLED !== 'true') {
      console.error('[ITN] Atomic payment processing is not enabled');
      return res.status(503).send('Payment processing unavailable');
    }

    const { data: result, error: processingError } = await supabase.rpc(
      'process_payfast_payment',
      {
        p_order_id: orderId,
        p_amount: amount,
        p_pf_payment_id: pfData.pf_payment_id || null,
        p_paid_at: paidAt,
        p_commission: commission,
        p_vendor_payout: vendorPayout,
      }
    );
    if (processingError) throw processingError;

    const outcome = Array.isArray(result) ? result[0] : result;
    if (!outcome?.order_id) {
      throw new Error('Atomic payment processor returned no order');
    }

    // Financial state is already committed. Notification failures must not
    // cause PayFast to retry or duplicate customer-facing messages.
    if (!outcome.already_processed) {
      const { data: updatedOrder, error: updatedOrderError } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .single();

      if (updatedOrderError || !updatedOrder) {
        console.error('[ITN] Paid order could not be loaded for notifications');
      } else {
        try {
          const io = req.app.get('io');
          const {
            emitNewOrder,
            emitOrderStatus,
            emitPaymentConfirmed,
          } = require('../websocket/handler');
          const {
            sendPushToVendor,
          } = require('../services/notificationService');

          await sendPaymentConfirmedEmail(orderId);

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
                body: `R${updatedOrder.total} - ${updatedOrder.order_number || updatedOrder.id.slice(0, 8)}`,
                data: { orderId: updatedOrder.id, type: 'new_order' },
              });
            }
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
        } catch (notificationError) {
          console.error(
            '[ITN] Payment committed; notification failed:',
            notificationError.message
          );
        }
      }
    }

    return res.status(200).send('OK');
  } catch (error) {
    console.error('[ITN] Processing failed:', error.message);
    return res.status(500).send('Webhook Error');
  }
});

router.get('/return', (req, res) => {
  try {
    return res.redirect(
      303,
      getOrderRedirectUrl(req.query.order_id, 'returned')
    );
  } catch (error) {
    console.error('[payments] Return redirect failed:', error.message);
    return res
      .status(500)
      .send('Payment received. Return to StreetPlate to view your order.');
  }
});

router.get('/cancel', (req, res) => {
  try {
    return res.redirect(
      303,
      getOrderRedirectUrl(req.query.order_id, 'cancelled')
    );
  } catch (error) {
    console.error('[payments] Cancel redirect failed:', error.message);
    return res
      .status(500)
      .send('Payment cancelled. Return to StreetPlate to retry.');
  }
});

module.exports = router;
