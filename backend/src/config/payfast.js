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

const encodePayFastValue = (value) =>
  encodeURIComponent(String(value).trim()).replace(/%20/g, '+');

/** Build the canonical PayFast parameter string in received/declaration order. */
const buildParameterString = (
  data,
  { includePassphrase = false, passphrase = PAYFAST_CONFIG.passphrase } = {}
) => {
  const parameterString = Object.keys(data)
    .filter((key) => key !== 'signature' && data[key] !== '' && data[key] != null)
    .map((key) => `${key}=${encodePayFastValue(data[key])}`)
    .join('&');

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
  isPayFastSourceIp,
  validateITN,
  calculateCommission,
  getApiUrl,
};
