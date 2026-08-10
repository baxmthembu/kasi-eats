const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('failed ITNs use insert-only persistence and cannot overwrite completion', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'payments.js'),
    'utf8'
  );
  const failureBranch = source.slice(
    source.indexOf("pfData.payment_status !== 'COMPLETE'"),
    source.indexOf('const paidAt')
  );
  assert.match(failureBranch, /\.from\('payments'\)\.insert\(/);
  assert.doesNotMatch(failureBranch, /upsert/);
  assert.match(failureBranch, /failureError\.code !== '23505'/);
});

test('completed ITNs require the atomic processor before acknowledgment', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'payments.js'),
    'utf8'
  );
  const gate = source.indexOf("PAYFAST_ATOMIC_RPC_ENABLED !== 'true'");
  const rpc = source.indexOf("'process_payfast_payment'");
  const response = source.indexOf("return res.status(200).send('OK')", rpc);
  assert.ok(gate > 0 && rpc > gate && response > rpc);
});

test('browser returns degrade to a safe success page without a website URL', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'payments.js'),
    'utf8'
  );
  assert.match(source, /\.status\(200\)\.type\('html'\)\.send\(renderPaymentResult\(\)\)/);
  assert.match(source, /renderPaymentResult\(\{ cancelled: true \}\)/);
  assert.match(source, /payment is being verified securely/i);
});
