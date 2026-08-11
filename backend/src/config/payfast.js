/**
 * PayFast payment configuration and verification helpers.
 *
 * Keep all signing material server-side. Never log the parameter string because
 * it can contain the merchant key and passphrase.
 */
const crypto = require('crypto');
const dns = require('dns').promises;
const axios = require('axios');

const isSandbox = process.env.PAYFAST_SANDBOX === 'true';

const PAYFAST_CONFIG = {
  merchantId: process.env.PAYFAST_MERCHANT_ID,
  merchantKey: process.env.PAYFAST_MERCHANT_KEY,
  passphrase: process.env.PAYFAST_PASSPHRASE || '',
  sandbox: isSandbox,
};

const PAYFAST_URL = PAYFAST_CONFIG.sandbox
  ? 'https://sandbox.payfast.co.za/eng/process'
  : 'https://www.payfast.co.za/eng/process';

const PAYFAST_VALIDATE_URL = PAYFAST_CONFIG.sandbox
  ? 'https://sandbox.payfast.co.za/eng/query/validate'
  : 'https://www.payfast.co.za/eng/query/validate';

const DEFAULT_PAYFAST_HOSTS = [
  'www.payfast.co.za',
  'sandbox.payfast.co.za',
  'ips.payfast.co.za',
  'w1w.payfast.co.za',
  'w2w.payfast.co.za',
];

// PayFast's documented ITN source ranges. DNS validation remains enabled below
// so future address changes published through their host records are accepted.
const DEFAULT_PAYFAST_IPV4_CIDRS = [
  '197.97.145.144/28',
  '41.74.179.192/27',
  '102.216.36.0/28',
  '102.216.36.128/28',
  '144.126.193.139/32',
];

/** Match PHP's urlencode(), which PayFast uses for signature generation. */
const encodePayFastValue = (value) =>
  encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    )
    .replace(/%20/g, '+');

/** Build the canonical PayFast parameter string in received/declaration order. */
const buildParameterString = (
  data,
  { includePassphrase = false, passphrase = PAYFAST_CONFIG.passphrase } = {}
) => {
  const fields = [];
  for (const key of Object.keys(data)) {
    // PayFast signs the fields in received order and places signature last.
    if (key === 'signature') break;
    if (data[key] == null) continue;
    fields.push(`${key}=${encodePayFastValue(data[key])}`);
  }
  const parameterString = fields.join('&');

  if (!includePassphrase || !passphrase) return parameterString;
  return `${parameterString}&passphrase=${encodePayFastValue(passphrase)}`;
};

const generateSignature = (data, passphrase = PAYFAST_CONFIG.passphrase) =>
  crypto
    .createHash('md5')
    .update(buildParameterString(data, { includePassphrase: true, passphrase }))
    .digest('hex');

const signaturesMatch = (actual, expected) => {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const actualBuffer = Buffer.from(actual.toLowerCase(), 'utf8');
  const expectedBuffer = Buffer.from(expected.toLowerCase(), 'utf8');
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
};

const isPrivateHostname = (hostname) => {
  const value = hostname.toLowerCase();
  return (
    value === 'localhost' ||
    value === '127.0.0.1' ||
    value === '::1' ||
    value.endsWith('.local') ||
    /^10\./.test(value) ||
    /^192\.168\./.test(value) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(value)
  );
};

const getApiUrl = () => {
  const rawUrl = process.env.API_URL || 'http://localhost:5000';
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('API_URL must be a valid absolute URL');
  }

  const requiresPublicHttps =
    process.env.NODE_ENV === 'production' || !PAYFAST_CONFIG.sandbox;
  if (
    requiresPublicHttps &&
    (url.protocol !== 'https:' || isPrivateHostname(url.hostname))
  ) {
    throw new Error('PayFast callbacks require API_URL to use a public HTTPS address');
  }

  return url.toString().replace(/\/$/, '');
};

const assertPayFastConfiguration = () => {
  if (
    !PAYFAST_CONFIG.merchantId ||
    !PAYFAST_CONFIG.merchantKey ||
    !PAYFAST_CONFIG.passphrase
  ) {
    throw new Error('PayFast merchant credentials are not configured');
  }
  return getApiUrl();
};

/** Generate signed PayFast fields for an order owned by the customer. */
const generatePaymentData = (order, customer) => {
  const apiUrl = assertPayFastConfiguration();
  const amount = Number(order.total);
  if (!order.id || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Order payment details are invalid');
  }

  const data = {
    merchant_id: PAYFAST_CONFIG.merchantId,
    merchant_key: PAYFAST_CONFIG.merchantKey,
    return_url: `${apiUrl}/api/payments/return?order_id=${encodeURIComponent(order.id)}`,
    cancel_url: `${apiUrl}/api/payments/cancel?order_id=${encodeURIComponent(order.id)}`,
    notify_url: `${apiUrl}/api/payments/notify`,
    name_first: customer.name?.split(' ')[0] || '',
    name_last: customer.name?.split(' ').slice(1).join(' ') || '',
    email_address: customer.email || '',
    m_payment_id: order.id,
    amount: amount.toFixed(2),
    item_name: `Street Plate Order ${order.id.slice(0, 8)}`,
    item_description: 'Food delivery order from vendor',
  };

  Object.keys(data).forEach((key) => {
    if (data[key] === '' || data[key] == null) delete data[key];
  });

  data.signature = generateSignature(data);

  if (process.env.PAYFAST_DEBUG === 'true') {
    console.info('[PayFast] Generated signed checkout fields', {
      sandbox: PAYFAST_CONFIG.sandbox,
      fieldNames: Object.keys(data).filter(
        (key) => !['merchant_key', 'signature'].includes(key)
      ),
    });
  }

  return { paymentUrl: PAYFAST_URL, paymentData: data };
};

const normalizeIp = (value) => String(value || '').trim().replace(/^::ffff:/, '');

/**
 * Railway overwrites X-Real-IP at its public edge. Use it only when Railway's
 * platform-provided environment marker is present; elsewhere, keep req.ip so a
 * caller cannot spoof the source check with an arbitrary header.
 */
const resolvePayFastRequestIp = ({
  requestIp,
  railwayRealIp,
  railwayEnvironmentId = process.env.RAILWAY_ENVIRONMENT_ID,
} = {}) => {
  if (railwayEnvironmentId && normalizeIp(railwayRealIp)) {
    return normalizeIp(railwayRealIp);
  }
  return normalizeIp(requestIp);
};

const ipv4ToInteger = (value) => {
  const octets = value.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null;
  }
  return octets.reduce((result, octet) => (result * 256 + octet) >>> 0, 0);
};

const isIpv4InCidr = (candidate, cidr) => {
  const [network, prefixValue] = cidr.split('/');
  const prefix = Number(prefixValue);
  const candidateValue = ipv4ToInteger(candidate);
  const networkValue = ipv4ToInteger(network);
  if (
    candidateValue == null ||
    networkValue == null ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 32
  ) {
    return false;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (candidateValue & mask) === (networkValue & mask);
};

const getPayFastHosts = () => {
  const configured = (process.env.PAYFAST_VALIDATION_HOSTS || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_PAYFAST_HOSTS;
};

/** Resolve PayFast's documented hosts and compare them with the request source. */
const isPayFastSourceIp = async (requestIp, lookup = dns.lookup) => {
  const candidate = normalizeIp(requestIp);
  if (!candidate) return false;

  if (DEFAULT_PAYFAST_IPV4_CIDRS.some((cidr) => isIpv4InCidr(candidate, cidr))) {
    return true;
  }

  const resolved = await Promise.allSettled(
    getPayFastHosts().map((host) => lookup(host, { all: true }))
  );
  const allowed = new Set(
    resolved.flatMap((result) =>
      result.status === 'fulfilled'
        ? result.value.map(({ address }) => normalizeIp(address))
        : []
    )
  );
  return allowed.has(candidate);
};

/** Validate signature, merchant, request source and PayFast confirmation. */
const validateITN = async (
  pfData,
  { requestIp, httpClient = axios, lookup = dns.lookup } = {}
) => {
  try {
    if (!pfData || typeof pfData !== 'object' || !pfData.signature) return false;
    if (!pfData.merchant_id || pfData.merchant_id !== PAYFAST_CONFIG.merchantId) {
      console.error('PayFast ITN rejected: invalid merchant');
      return false;
    }

    const expectedSignature = generateSignature(pfData);
    if (!signaturesMatch(pfData.signature, expectedSignature)) {
      console.error('PayFast ITN rejected: invalid signature');
      return false;
    }

    if (!(await isPayFastSourceIp(requestIp, lookup))) {
      console.error('PayFast ITN rejected: invalid request source');
      return false;
    }

    const parameterString = buildParameterString(pfData);
    const response = await httpClient.post(PAYFAST_VALIDATE_URL, parameterString, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: Number(process.env.PAYFAST_VALIDATION_TIMEOUT_MS || 10000),
      maxRedirects: 0,
    });

    return String(response.data).trim() === 'VALID';
  } catch (error) {
    console.error('PayFast ITN validation failed:', error.message);
    return false;
  }
};

const calculateCommission = (amount) => {
  const total = Number(amount);
  if (!Number.isFinite(total) || total < 0) throw new Error('Invalid payment amount');
  const commission = Math.round(total * 0.15 * 100) / 100;
  const vendorPayout = Math.round((total - commission) * 100) / 100;
  return { commission, vendorPayout };
};

module.exports = {
  PAYFAST_CONFIG,
  PAYFAST_URL,
  PAYFAST_VALIDATE_URL,
  buildParameterString,
  generateSignature,
  signaturesMatch,
  generatePaymentData,
  resolvePayFastRequestIp,
  isPayFastSourceIp,
  validateITN,
  calculateCommission,
  getApiUrl,
};
