const net = require('net');
const { Redis } = require('@upstash/redis');
const { redisCredentials } = require('./distributedRateLimitStore');

const withTimeout = (promise, timeoutMs = 4000) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Readiness check timed out')), timeoutMs),
    ),
  ]);

const requiredConfigurationPresent = (environment = process.env) => {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
    'API_URL',
    'WEB_APP_URL',
    'ALLOWED_ORIGINS',
    'TURNSTILE_SECRET',
    'TURNSTILE_HOSTNAMES',
    'PAYFAST_MERCHANT_ID',
    'PAYFAST_MERCHANT_KEY',
    'PAYFAST_PASSPHRASE',
    'RESEND_API_KEY',
  ];
  const redis = redisCredentials(environment);
  const malwareReady =
    environment.MALWARE_SCAN_ENABLED !== 'false' && Boolean(environment.CLAMAV_HOST?.trim());
  return required.every((name) => Boolean(environment[name]?.trim())) &&
    Boolean(redis.url && redis.token) &&
    malwareReady;
};

const checkSupabase = async (environment = process.env, fetchImpl = global.fetch) => {
  const response = await fetchImpl(`${environment.SUPABASE_URL}/auth/v1/health`, {
    headers: { apikey: environment.SUPABASE_ANON_KEY },
    signal: AbortSignal.timeout(4000),
  });
  return response.ok;
};

const checkRedis = async (environment = process.env) => {
  const { url, token } = redisCredentials(environment);
  const redis = new Redis({ url, token });
  return (await redis.ping()) === 'PONG';
};

const checkClamAv = async (environment = process.env) =>
  new Promise((resolve) => {
    const socket = net.createConnection({
      host: environment.CLAMAV_HOST,
      port: Number.parseInt(environment.CLAMAV_PORT || '3310', 10),
    });
    const finish = (ready) => {
      socket.destroy();
      resolve(ready);
    };
    socket.setTimeout(3000);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });

const safeCheck = async (check) => {
  try {
    return Boolean(await withTimeout(check()));
  } catch {
    return false;
  }
};

const checkReadiness = async (
  environment = process.env,
  dependencies = { checkSupabase, checkRedis, checkClamAv },
) => {
  const configured = requiredConfigurationPresent(environment);
  const [supabase, redis, malwareScanner] = configured
    ? await Promise.all([
        safeCheck(() => dependencies.checkSupabase(environment)),
        safeCheck(() => dependencies.checkRedis(environment)),
        safeCheck(() => dependencies.checkClamAv(environment)),
      ])
    : [false, false, false];

  const checks = { configured, supabase, redis, malwareScanner };
  return { ready: Object.values(checks).every(Boolean), checks };
};

module.exports = {
  checkClamAv,
  checkReadiness,
  checkRedis,
  checkSupabase,
  requiredConfigurationPresent,
};
