const test = require('node:test');
const assert = require('node:assert/strict');

const { verifyTurnstile } = require('../src/services/turnstileService');

const environment = { TURNSTILE_HOSTNAMES: 'streetplate.co.za,localhost' };

test('accepts an exact Turnstile action and hostname', async () => {
  let request;
  const result = await verifyTurnstile(
    { token: 'fresh-token', action: 'password_update', remoteIp: '192.0.2.1' },
    {
      secret: 'test-secret',
      environment,
      fetchImpl: async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          json: async () => ({
            success: true,
            action: 'password_update',
            hostname: 'streetplate.co.za',
          }),
        };
      },
    },
  );

  assert.deepEqual(result, { success: true });
  assert.equal(request.options.body.get('response'), 'fresh-token');
  assert.equal(request.options.body.get('remoteip'), '192.0.2.1');
});

test('rejects mismatched actions, hostnames, and invalid tokens', async () => {
  const response = (action, hostname) => async () => ({
    ok: true,
    json: async () => ({ success: true, action, hostname }),
  });
  const wrongAction = await verifyTurnstile(
    { token: 'token', action: 'password_update' },
    { secret: 'secret', environment, fetchImpl: response('login', 'streetplate.co.za') },
  );
  const wrongHostname = await verifyTurnstile(
    { token: 'token', action: 'password_update' },
    { secret: 'secret', environment, fetchImpl: response('password_update', 'example.com') },
  );
  const missing = await verifyTurnstile(
    { token: '', action: 'login' },
    { secret: 'secret', environment, fetchImpl: response('login', 'localhost') },
  );

  assert.equal(wrongAction.success, false);
  assert.equal(wrongHostname.success, false);
  assert.equal(missing.success, false);
});
