const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DistributedRateLimitStore,
  createDistributedStore,
} = require('../src/services/distributedRateLimitStore');

test('uses one hashed Redis key per namespace and returns reset metadata', async () => {
  const calls = [];
  const redis = {
    async eval(script, keys, args) {
      calls.push({ script, keys, args });
      return [2, 4500];
    },
    async del() {},
  };
  const store = new DistributedRateLimitStore({
    namespace: 'auth',
    redis,
    environment: { NODE_ENV: 'test', RATE_LIMIT_NAMESPACE: 'staging' },
  });
  store.init({ windowMs: 60_000 });

  const result = await store.increment('203.0.113.4');
  assert.equal(result.totalHits, 2);
  assert.equal(calls[0].args[0], '60000');
  assert.match(calls[0].keys[0], /^streetplate:api-rate-limit:v1:staging:auth:[a-f0-9]{64}$/);
  assert.doesNotMatch(calls[0].keys[0], /203\.0\.113\.4/);
});

test('fails fast without distributed credentials only in production', () => {
  assert.equal(createDistributedStore('auth', { NODE_ENV: 'test' }), undefined);
  assert.throws(
    () => createDistributedStore('auth', { NODE_ENV: 'production' }),
    /not configured/,
  );
});
