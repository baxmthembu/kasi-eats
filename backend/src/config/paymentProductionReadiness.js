const PLACEHOLDER_PATTERN = /^(?:your[_-]|change[_-]?me|replace[_-]?me|example$)/i;

const hasProductionSecret = (value) => {
  const normalized = String(value || '').trim();
  return normalized.length >= 4 && !PLACEHOLDER_PATTERN.test(normalized);
};

const isPublicHttpsUrl = (value) => {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isPrivate =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
    return url.protocol === 'https:' && !isPrivate;
  } catch {
    return false;
  }
};

const validatePaymentProductionEnv = (env) => {
  const errors = [];
  if (env.NODE_ENV !== 'production') errors.push('NODE_ENV must be production');
  if (!isPublicHttpsUrl(env.API_URL)) errors.push('API_URL must be a public HTTPS URL');
  if (!isPublicHttpsUrl(env.WEB_APP_URL)) {
    errors.push('WEB_APP_URL must be a public HTTPS URL');
  }
  if (env.PAYFAST_SANDBOX !== 'false') errors.push('PAYFAST_SANDBOX must be false');
  if (env.PAYFAST_DEBUG !== 'false') errors.push('PAYFAST_DEBUG must be false');
  if (env.PAYFAST_ATOMIC_RPC_ENABLED !== 'true') {
    errors.push('PAYFAST_ATOMIC_RPC_ENABLED must be true after the migration is applied');
  }

  for (const name of [
    'PAYFAST_MERCHANT_ID',
    'PAYFAST_MERCHANT_KEY',
    'PAYFAST_PASSPHRASE',
  ]) {
    if (!hasProductionSecret(env[name])) {
      errors.push(`${name} is missing or still a placeholder`);
    }
  }

  const timeout = Number(env.PAYFAST_VALIDATION_TIMEOUT_MS);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 30000) {
    errors.push('PAYFAST_VALIDATION_TIMEOUT_MS must be between 1000 and 30000');
  }

  const proxyHops = Number(env.TRUST_PROXY_HOPS);
  if (!Number.isInteger(proxyHops) || proxyHops < 1) {
    errors.push('TRUST_PROXY_HOPS must be a positive integer verified for the host');
  }
  return errors;
};

module.exports = { isPublicHttpsUrl, validatePaymentProductionEnv };
