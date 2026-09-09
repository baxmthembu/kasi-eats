const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const route = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'routes', 'vendorPayouts.js'),
  'utf8',
);

test('resolveVendorId raises a distinguishable not-found error', () => {
  assert.match(route, /class VendorNotFoundError extends Error/);
  assert.match(route, /this\.status = 404/);
  assert.match(route, /throw new VendorNotFoundError\(\)/);
});

test('every resolveVendorId caller reports 404, not 500, when the vendor is missing', () => {
  const callers = [
    "router.get('/vendors/wallet'",
    "router.get('/vendors/payouts'",
    "router.put('/vendors/bank-details'",
  ];
  const boundaries = [...callers, "router.get('/admin/vendor-payouts'"].map((marker) =>
    route.indexOf(marker),
  );

  callers.forEach((marker, index) => {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    assert.ok(start >= 0, `expected to find handler for ${marker}`);
    const handler = route.slice(start, end);
    assert.match(
      handler,
      /if \(e instanceof VendorNotFoundError\) return res\.status\(404\)\.json/,
      `expected ${marker} to short-circuit to 404 on VendorNotFoundError`,
    );
  });
});
