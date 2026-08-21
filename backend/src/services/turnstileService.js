const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN_LENGTH = 2048;
const ALLOWED_ACTIONS = new Set(['login', 'signup', 'password_reset', 'password_update']);

const allowedHostnames = (environment = process.env) =>
  new Set(
    (environment.TURNSTILE_HOSTNAMES || '')
      .split(',')
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );

const verifyTurnstile = async (
  { token, action, remoteIp },
  {
    fetchImpl = global.fetch,
    secret = process.env.TURNSTILE_SECRET,
    environment = process.env,
  } = {},
) => {
  const hostnames = allowedHostnames(environment);
  if (!secret || hostnames.size === 0 || !ALLOWED_ACTIONS.has(action)) {
    return { success: false, reason: 'not_configured' };
  }
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { success: false, reason: 'invalid_token' };
  }
  if (typeof fetchImpl !== 'function') {
    return { success: false, reason: 'fetch_unavailable' };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { success: false, reason: 'provider_error' };

    const result = await response.json();
    if (
      result.success !== true ||
      result.action !== action ||
      typeof result.hostname !== 'string' ||
      !hostnames.has(result.hostname.toLowerCase())
    ) {
      return { success: false, reason: 'challenge_rejected' };
    }
    return { success: true };
  } catch {
    return { success: false, reason: 'provider_unavailable' };
  }
};

module.exports = { allowedHostnames, verifyTurnstile };
