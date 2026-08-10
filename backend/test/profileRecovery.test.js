const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const authSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'routes', 'auth.js'),
  'utf8'
);

test('profile recovery verifies the Supabase user and current password', () => {
  const start = authSource.indexOf("router.post('/profile/complete'");
  const route = authSource.slice(start);
  assert.ok(start > 0);
  assert.match(route, /getSupabaseAuthUser\(req, res\)/);
  assert.match(route, /signInWithPassword/);
  assert.match(route, /passwordAuth\.user\?\.id !== authUser\.id/);
});

test('profile recovery never deletes the confirmed Auth account', () => {
  const start = authSource.indexOf("router.post('/profile/complete'");
  const route = authSource.slice(start);
  assert.doesNotMatch(route, /auth\.admin\.deleteUser/);
  assert.match(route, /code: 'PHONE_EXISTS'/);
});

test('registration reports phone conflicts before incomplete auth profiles', () => {
  const register = authSource.slice(
    authSource.indexOf("router.post('/register'"),
    authSource.indexOf("router.post('/profile/complete'")
  );
  assert.ok(register.indexOf("code: 'PHONE_EXISTS'") < register.indexOf("code: 'PROFILE_INCOMPLETE'"));
});
