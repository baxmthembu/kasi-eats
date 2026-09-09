const test = require('node:test');
const assert = require('node:assert/strict');

const { validateProductionEnv } = require('../src/config/productionReadiness');

const validEnv = {
  NODE_ENV: 'production',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SUPABASE_ANON_KEY: 'anon-key',
  JWT_SECRET: 'jwt-secret',
  API_URL: 'https://api.streetplate.co.za',
  WEB_APP_URL: 'https://streetplate.co.za',
  ALLOWED_ORIGINS: 'https://streetplate.co.za,https://www.streetplate.co.za',
  TURNSTILE_SECRET: 'turnstile-secret',
  TURNSTILE_HOSTNAMES: 'streetplate.co.za,www.streetplate.co.za',
  KV_REST_API_URL: 'https://redis.upstash.io',
  KV_REST_API_TOKEN: 'kv-token',
  RATE_LIMIT_NAMESPACE: 'production',
  CLAMAV_HOST: 'clamav.internal',
  PAYFAST_MERCHANT_ID: '10000100',
  PAYFAST_MERCHANT_KEY: 'merchant-key',
  PAYFAST_PASSPHRASE: 'passphrase',
  RESEND_API_KEY: 'resend-key',
  PAYFAST_SANDBOX: 'false',
  PAYFAST_DEBUG: 'false',
  PAYFAST_ATOMIC_RPC_ENABLED: 'true',
  MALWARE_SCAN_ENABLED: 'true',
  TRUST_PROXY_HOPS: '1',
};

test('validateProductionEnv accepts a fully configured production environment', () => {
  assert.deepEqual(validateProductionEnv(validEnv), []);
});

test('validateProductionEnv rejects a development-shaped configuration', () => {
  const errors = validateProductionEnv({
    NODE_ENV: 'development',
    API_URL: 'http://localhost:5000',
    WEB_APP_URL: 'http://localhost:3000',
    ALLOWED_ORIGINS: '*',
    TURNSTILE_HOSTNAMES: 'localhost',
    PAYFAST_SANDBOX: 'true',
    PAYFAST_DEBUG: 'true',
    PAYFAST_ATOMIC_RPC_ENABLED: 'false',
    MALWARE_SCAN_ENABLED: 'false',
    TRUST_PROXY_HOPS: '0',
  });
  assert.ok(errors.includes('NODE_ENV must be production.'));
  assert.ok(errors.includes('PAYFAST_SANDBOX must be false.'));
  assert.ok(errors.includes('PAYFAST_DEBUG must be false.'));
  assert.ok(errors.includes('PAYFAST_ATOMIC_RPC_ENABLED must be true.'));
  assert.ok(errors.includes('MALWARE_SCAN_ENABLED must be true.'));
  assert.ok(errors.includes('TRUST_PROXY_HOPS must be a verified positive integer.'));
  assert.ok(
    errors.includes('Production TURNSTILE_HOSTNAMES must not include local development hosts.')
  );
  assert.ok(errors.includes('ALLOWED_ORIGINS must contain an explicit allowlist.'));
  assert.ok(errors.includes('API_URL must use HTTPS.'));
  assert.ok(errors.includes('WEB_APP_URL must use HTTPS.'));
});

test('validateProductionEnv rejects a non-HTTPS CORS origin', () => {
  const errors = validateProductionEnv({
    ...validEnv,
    ALLOWED_ORIGINS: 'https://streetplate.co.za,http://insecure.example.com',
  });
  assert.ok(errors.includes('CORS origin must use HTTPS: http://insecure.example.com'));
});

test('validateProductionEnv flags each missing required variable', () => {
  const errors = validateProductionEnv({});
  for (const name of [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
    'JWT_SECRET',
    'API_URL',
    'WEB_APP_URL',
    'ALLOWED_ORIGINS',
    'TURNSTILE_SECRET',
    'TURNSTILE_HOSTNAMES',
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
    'RATE_LIMIT_NAMESPACE',
    'CLAMAV_HOST',
    'PAYFAST_MERCHANT_ID',
    'PAYFAST_MERCHANT_KEY',
    'PAYFAST_PASSPHRASE',
    'RESEND_API_KEY',
  ]) {
    assert.ok(errors.includes(`${name} is required.`), `expected error for ${name}`);
  }
});
