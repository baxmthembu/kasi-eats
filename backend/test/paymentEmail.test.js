const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPaymentConfirmedEmail,
  escapeHtml,
  sendEmail,
} = require('../src/services/paymentEmailService');

test('payment email escapes user-controlled content', () => {
  const message = buildPaymentConfirmedEmail({
    id: '11111111-1111-4111-8111-111111111111',
    order_number: '<script>alert(1)</script>',
    total: 125.5,
    customerName: '<img src=x onerror=alert(1)>',
  });
  assert.equal(message.html.includes('<script>'), false);
  assert.equal(message.html.includes('<img src=x'), false);
  assert.equal(escapeHtml('A&B'), 'A&amp;B');
});

test('payment email uses a stable idempotency key without exposing the API key', async () => {
  const calls = [];
  const result = await sendEmail(
    {
      to: 'customer@example.invalid',
      subject: 'Payment confirmed',
      html: '<p>Paid</p>',
      text: 'Paid',
      idempotencyKey: 'payment-completed/order-1',
    },
    {
      apiKey: 'restricted-test-key',
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ id: 'email-1' }) };
      },
    }
  );
  assert.deepEqual(result, { success: true, id: 'email-1' });
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'payment-completed/order-1');
  assert.equal(calls[0].options.body.includes('restricted-test-key'), false);
});
