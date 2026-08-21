require('dotenv').config();

const errors = [];
const required = [
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
];

for (const name of required) {
  if (!process.env[name]?.trim()) errors.push(`${name} is required.`);
}

const requireHttps = (name) => {
  try {
    if (new URL(process.env[name]).protocol !== 'https:') {
      errors.push(`${name} must use HTTPS.`);
    }
  } catch {
    errors.push(`${name} must be a valid public HTTPS URL.`);
  }
};

requireHttps('API_URL');
requireHttps('WEB_APP_URL');
requireHttps('SUPABASE_URL');
requireHttps('KV_REST_API_URL');

if (process.env.NODE_ENV !== 'production') errors.push('NODE_ENV must be production.');
if (process.env.PAYFAST_SANDBOX !== 'false') errors.push('PAYFAST_SANDBOX must be false.');
if (process.env.PAYFAST_DEBUG !== 'false') errors.push('PAYFAST_DEBUG must be false.');
if (process.env.PAYFAST_ATOMIC_RPC_ENABLED !== 'true') {
  errors.push('PAYFAST_ATOMIC_RPC_ENABLED must be true.');
}
if (process.env.MALWARE_SCAN_ENABLED !== 'true') {
  errors.push('MALWARE_SCAN_ENABLED must be true.');
}

const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || '', 10);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 1) {
  errors.push('TRUST_PROXY_HOPS must be a verified positive integer.');
}

const hostnames = (process.env.TURNSTILE_HOSTNAMES || '')
  .split(',')
  .map((value) => value.trim().toLowerCase());
if (hostnames.some((hostname) => hostname === 'localhost' || hostname === '127.0.0.1')) {
  errors.push('Production TURNSTILE_HOSTNAMES must not include local development hosts.');
}

const origins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
if (origins.length === 0 || origins.includes('*')) {
  errors.push('ALLOWED_ORIGINS must contain an explicit allowlist.');
}
for (const origin of origins) {
  try {
    if (new URL(origin).protocol !== 'https:') errors.push(`CORS origin must use HTTPS: ${origin}`);
  } catch {
    errors.push(`Invalid CORS origin: ${origin}`);
  }
}

if (errors.length) {
  console.error('Production configuration is not ready:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Production configuration validation passed.');
