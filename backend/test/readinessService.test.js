const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkReadiness,
  requiredConfigurationPresent,
} = require('../src/services/readinessService');

const completeEnvironment = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  SUPABASE_ANON_KEY: 'anon',
  API_URL: 'https://api.streetplate.co.za',
  WEB_APP_URL: 'https://www.streetplate.co.za',
  ALLOWED_ORIGINS: 'https://www.streetplate.co.za',
  TURNSTILE_SECRET: 'secret',
  TURNSTILE_HOSTNAMES: 'streetplate.co.za',
  PAYFAST_MERCHANT_ID: 'merchant',
  PAYFAST_MERCHANT_KEY: 'key',
  PAYFAST_PASSPHRASE: 'passphrase',
  RESEND_API_KEY: 'resend',
  KV_REST_API_URL: 'https://redis.example',
  KV_REST_API_TOKEN: 'redis-token',
  MALWARE_SCAN_ENABLED: 'true',
  CLAMAV_HOST: 'clamav.railway.internal',
};

test('reports ready only when configuration and all dependencies are healthy', async () => {
  const dependencies = {
    checkSupabase: async () => true,
    checkRedis: async () => true,
    checkClamAv: async () => true,
  };
  assert.equal(requiredConfigurationPresent(completeEnvironment), true);
  assert.deepEqual(await checkReadiness(completeEnvironment, dependencies), {
    ready: true,
    checks: { configured: true, supabase: true, redis: true, malwareScanner: true },
  });

  dependencies.checkRedis = async () => false;
  assert.equal((await checkReadiness(completeEnvironment, dependencies)).ready, false);
});

test('does not contact dependencies when required configuration is missing', async () => {
  let calls = 0;
  const dependencies = {
    checkSupabase: async () => { calls += 1; },
    checkRedis: async () => { calls += 1; },
    checkClamAv: async () => { calls += 1; },
  };
  const result = await checkReadiness({}, dependencies);
  assert.equal(result.ready, false);
  assert.equal(calls, 0);
});
