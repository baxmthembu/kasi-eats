const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PAYFAST_MERCHANT_ID = 'test-merchant-id';
process.env.PAYFAST_MERCHANT_KEY = 'test-merchant-key';
process.env.PAYFAST_PASSPHRASE = 'test-passphrase';
process.env.PAYFAST_SANDBOX = 'true';
process.env.API_URL = 'http://127.0.0.1:5000';
process.env.NODE_ENV = 'test';

const {
  buildParameterString,
  calculateCommission,
  generatePaymentData,
  generateSignature,
  getApiUrl,
  isPayFastSourceIp,
  resolvePayFastRequestIp,
  validateITN,
} = require('../src/config/payfast');
const {
  isPublicHttpsUrl,
  validatePaymentProductionEnv,
} = require('../src/config/paymentProductionReadiness');

test('buildParameterString preserves declaration order and excludes signature', () => {
  const value = buildParameterString({
    merchant_id: 'merchant 1',
    amount: '120.00',
    item_name: 'Street Plate order',
    signature: 'ignored',
  });
  assert.equal(
    value,
    'merchant_id=merchant+1&amount=120.00&item_name=Street+Plate+order'
  );
});

test('buildParameterString matches PayFast PHP encoding and ITN field boundaries', () => {
  const value = buildParameterString({
    name_first: " O'Neil ",
    custom_str1: '',
    signature: 'ignored',
    injected_after_signature: 'must-not-be-signed',
  });
  assert.equal(value, 'name_first=+O%27Neil+&custom_str1=');
});

test('generatePaymentData signs valid sandbox fields without logging secrets', () => {
  process.env.PAYFAST_DEBUG = 'true';
  const messages = [];
  const originalInfo = console.info;
  console.info = (...args) => messages.push(args);

  try {
    const result = generatePaymentData(
      { id: '11111111-1111-4111-8111-111111111111', total: '125.50' },
      { name: 'Test Customer', email: 'customer@example.com' }
    );
    assert.equal(result.paymentData.amount, '125.50');
    assert.equal(result.paymentData.signature, generateSignature(result.paymentData));
    assert.equal(
      result.paymentData.notify_url,
      'http://127.0.0.1:5000/api/payments/notify'
    );
    assert.match(result.paymentData.signature, /^[a-f0-9]{32}$/);
    const logged = JSON.stringify(messages);
    assert.equal(logged.includes('test-merchant-key'), false);
    assert.equal(logged.includes('test-passphrase'), false);
  } finally {
    console.info = originalInfo;
    process.env.PAYFAST_DEBUG = 'false';
  }
});

test('production rejects local callback URLs', () => {
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(getApiUrl, /public HTTPS address/);
  } finally {
    process.env.NODE_ENV = previousEnvironment;
  }
});

test('PayFast source validation accepts resolved IPv4-mapped addresses', async () => {
  const lookup = async () => [{ address: '197.97.145.144', family: 4 }];
  assert.equal(await isPayFastSourceIp('::ffff:197.97.145.144', lookup), true);
  assert.equal(await isPayFastSourceIp('203.0.113.10', lookup), false);
});

test('PayFast source validation accepts documented ITN ranges', async () => {
  const noDnsResults = async () => [];
  assert.equal(await isPayFastSourceIp('144.126.193.139', noDnsResults), true);
  assert.equal(await isPayFastSourceIp('197.97.145.159', noDnsResults), true);
  assert.equal(await isPayFastSourceIp('197.97.145.160', noDnsResults), false);
  assert.equal(await isPayFastSourceIp('102.216.36.143', noDnsResults), true);
  assert.equal(await isPayFastSourceIp('102.216.36.144', noDnsResults), false);
});

test('Railway ITNs use the edge-authenticated real IP without trusting it elsewhere', () => {
  assert.equal(
    resolvePayFastRequestIp({
      requestIp: '100.64.0.1',
      railwayRealIp: '144.126.193.139',
      railwayEnvironmentId: 'production-id',
    }),
    '144.126.193.139'
  );
  assert.equal(
    resolvePayFastRequestIp({
      requestIp: '203.0.113.10',
      railwayRealIp: '144.126.193.139',
      railwayEnvironmentId: '',
    }),
    '203.0.113.10'
  );
});

test('validateITN rejects a missing merchant identifier', async () => {
  const payload = {
    m_payment_id: '11111111-1111-4111-8111-111111111111',
    amount_gross: '100.00',
    payment_status: 'COMPLETE',
  };
  payload.signature = generateSignature(payload);
  assert.equal(
    await validateITN(payload, {
      requestIp: '197.97.145.144',
      lookup: async () => [{ address: '197.97.145.144', family: 4 }],
    }),
    false
  );
});

test('validateITN rejects tampering before calling PayFast', async () => {
  let called = false;
  const valid = await validateITN(
    {
      merchant_id: 'test-merchant-id',
      m_payment_id: '11111111-1111-4111-8111-111111111111',
      amount_gross: '100.00',
      signature: '00000000000000000000000000000000',
    },
    {
      requestIp: '197.97.145.144',
      lookup: async () => [{ address: '197.97.145.144', family: 4 }],
      httpClient: { post: async () => { called = true; } },
    }
  );
  assert.equal(valid, false);
  assert.equal(called, false);
});

test('validateITN performs signature, source and server confirmation checks', async () => {
  const payload = {
    merchant_id: 'test-merchant-id',
    m_payment_id: '11111111-1111-4111-8111-111111111111',
    amount_gross: '100.00',
    payment_status: 'COMPLETE',
  };
  payload.signature = generateSignature(payload);

  let postedBody = '';
  const valid = await validateITN(payload, {
    requestIp: '197.97.145.144',
    lookup: async () => [{ address: '197.97.145.144', family: 4 }],
    httpClient: {
      post: async (_url, body, options) => {
        postedBody = body;
        assert.equal(options.timeout, 10000);
        return { data: 'VALID' };
      },
    },
  });
  assert.equal(valid, true);
  assert.equal(postedBody.includes('signature='), false);
  assert.equal(postedBody.includes('passphrase='), false);
});

test('calculateCommission keeps the 15/85 business rule', () => {
  assert.deepEqual(calculateCommission('100.00'), {
    commission: 15,
    vendorPayout: 85,
  });
});

test('production readiness rejects unsafe payment configuration', () => {
  assert.equal(isPublicHttpsUrl('https://api.streetplate.co.za'), true);
  assert.equal(isPublicHttpsUrl('http://127.0.0.1:5000'), false);
  const errors = validatePaymentProductionEnv({
    NODE_ENV: 'development',
    API_URL: 'http://localhost:5000',
    WEB_APP_URL: 'https://streetplate.co.za',
    PAYFAST_SANDBOX: 'true',
    PAYFAST_DEBUG: 'true',
    PAYFAST_ATOMIC_RPC_ENABLED: 'false',
    PAYFAST_MERCHANT_ID: 'your_merchant_id',
    PAYFAST_MERCHANT_KEY: 'your_merchant_key',
    PAYFAST_PASSPHRASE: 'your_passphrase',
    PAYFAST_VALIDATION_TIMEOUT_MS: '0',
    TRUST_PROXY_HOPS: '0',
  });
  assert.equal(errors.length, 10);
});

test('production readiness accepts a fully configured payment environment', () => {
  const errors = validatePaymentProductionEnv({
    NODE_ENV: 'production',
    API_URL: 'https://api.streetplate.co.za',
    WEB_APP_URL: 'https://streetplate.co.za',
    PAYFAST_SANDBOX: 'false',
    PAYFAST_DEBUG: 'false',
    PAYFAST_ATOMIC_RPC_ENABLED: 'true',
    PAYFAST_MERCHANT_ID: '10000100',
    PAYFAST_MERCHANT_KEY: 'rotated-key',
    PAYFAST_PASSPHRASE: 'rotated-passphrase',
    PAYFAST_VALIDATION_TIMEOUT_MS: '10000',
    TRUST_PROXY_HOPS: '1',
  });
  assert.deepEqual(errors, []);
});
