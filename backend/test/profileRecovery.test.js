const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const authSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'routes', 'auth.js'),
  'utf8'
);

const middlewareSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'middleware', 'auth.js'),
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
  assert.match(register, /captchaToken: turnstile_token/);
});

test('protected routes report PROFILE_INCOMPLETE when the public profile is missing', () => {
  // Without this code the web client cannot tell a recoverable orphaned
  // account from an expired session, and redirects it to sign-in forever
  // instead of to the profile-completion page.
  const start = middlewareSource.indexOf("User profile not found.");
  assert.ok(start > 0, 'the profile-missing branch should still exist');
  const branch = middlewareSource.slice(start, start + 200);
  assert.match(branch, /code: 'PROFILE_INCOMPLETE'/);
});
