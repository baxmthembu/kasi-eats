const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const DEFAULT_ORDERS_FROM = 'StreetPlate Orders <orders@streetplate.co.za>';

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

const getSiteUrl = () =>
  (process.env.WEB_APP_URL || 'https://streetplate.co.za').replace(/\/$/, '');

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(Number(value) || 0);

const buildPaymentConfirmedEmail = (order) => {
  const reference = order.order_number || String(order.id).slice(0, 8).toUpperCase();
  const accountUrl = `${getSiteUrl()}/account`;
  const subject = `Payment confirmed for order ${reference}`;
  const text = `Hi ${order.customerName || 'there'},\n\nYour payment for order ${reference} was verified successfully.\n\nPaid: ${formatCurrency(order.total)}\n\nTrack your order: ${accountUrl}`;
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#fff7ed;font-family:Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #fed7aa;border-radius:18px;overflow:hidden;">
          <tr><td style="background:#064e3b;padding:24px 28px;color:#ffffff;">
            <div style="color:#fb923c;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;">StreetPlate</div>
            <h1 style="margin:8px 0 0;">Payment successful</h1>
          </td></tr>
          <tr><td style="padding:28px;">
            <p>Hi ${escapeHtml(order.customerName || 'there')},</p>
            <p>Your payment for order <strong>${escapeHtml(reference)}</strong> was verified successfully.</p>
            <p style="font-size:20px;font-weight:700;">Paid: ${escapeHtml(formatCurrency(order.total))}</p>
            <a href="${escapeHtml(accountUrl)}" style="display:inline-block;background:#f97316;color:#111827;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:10px;">Track your order</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  return { subject, text, html };
};

const getTimeoutMs = () => {
  const value = Number.parseInt(process.env.RESEND_TIMEOUT_MS || '5000', 10);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1000), 15000) : 5000;
};

const sendEmail = async (
  { to, subject, html, text, idempotencyKey },
  { apiKey = process.env.RESEND_API_KEY, fetchImpl = global.fetch } = {}
) => {
  if (!apiKey || typeof fetchImpl !== 'function') {
    return { success: false, skipped: true, reason: 'not_configured' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());
  try {
    const response = await fetchImpl(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.RESEND_ORDERS_FROM || DEFAULT_ORDERS_FROM,
        to: [to],
        subject,
        html,
        text,
        tags: [{ name: 'event', value: 'payment-completed' }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { success: false, status: response.status };
    const data = await response.json();
    return { success: true, id: data.id };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
};

const sendPaymentConfirmedEmail = async (orderId) => {
  const { supabase } = require('../config/supabase');
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, order_number, total, customer_id')
    .eq('id', orderId)
    .single();
  if (orderError || !order) return { success: false, skipped: true };

  const { data: customer, error: customerError } = await supabase
    .from('users')
    .select('email, name')
    .eq('id', order.customer_id)
    .single();
  if (customerError || !customer?.email) return { success: false, skipped: true };

  return sendEmail({
    to: customer.email,
    ...buildPaymentConfirmedEmail({
      ...order,
      customerName: customer.name,
    }),
    idempotencyKey: `payment-completed/${orderId}`,
  });
};

module.exports = {
  DEFAULT_ORDERS_FROM,
  buildPaymentConfirmedEmail,
  escapeHtml,
  sendEmail,
  sendPaymentConfirmedEmail,
};
