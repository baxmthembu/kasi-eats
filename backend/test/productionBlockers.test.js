const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const authSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'routes', 'auth.js'),
  'utf8',
);
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('passes Turnstile tokens to Supabase auth methods used by web and mobile', () => {
  assert.match(authSource, /signUp\([\s\S]*captchaToken: turnstile_token/);
  assert.match(authSource, /resetPasswordForEmail\([\s\S]*captchaToken: turnstile_token/);
  assert.match(authSource, /auth\.resend\([\s\S]*captchaToken: turnstile_token/);
});

test('protects password updates with a recovery session and exact Turnstile action', () => {
  const route = authSource.slice(authSource.indexOf("router.post('/update-password'"));
  assert.match(route, /supabase\.auth\.getUser\(accessToken\)/);
  assert.match(route, /enforceTurnstile\(req, res, 'password_update'\)/);
  assert.match(route, /admin\.updateUserById\(authData\.user\.id/);
});

test('mounts payout routes before the generic vendor id route', () => {
  assert.ok(
    serverSource.indexOf("app.use('/api', vendorPayoutsRoutes)") <
      serverSource.indexOf("app.use('/api/vendors', vendorRoutes)"),
  );
});
