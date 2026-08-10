const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('vendor banking is stored outside the publicly readable vendors table', () => {
  const schema = read('database/schema.sql');
  const service = read('src/services/vendorPayoutService.js');
  const route = read('src/routes/vendorPayouts.js');
  const bankRoute = route.slice(
    route.indexOf("router.put('/vendors/bank-details'"),
    route.indexOf("router.get('/admin/vendor-payouts'")
  );

  assert.match(schema, /CREATE TABLE IF NOT EXISTS vendor_bank_details/);
  assert.doesNotMatch(schema, /ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bank_/);
  assert.match(service, /\.from\('vendor_bank_details'\)/);
  assert.match(route, /\.from\('vendor_bank_details'\)/);
  assert.doesNotMatch(bankRoute, /\.from\('vendors'\)/);
});

test('bank-details API keeps its existing response timestamp field', () => {
  const route = read('src/routes/vendorPayouts.js');
  assert.match(route, /bank_details_updated_at:\s*updated_at/);
});
