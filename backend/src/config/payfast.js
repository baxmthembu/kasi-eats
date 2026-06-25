/**
 * PayFast Payment Configuration
 * Sandbox and production support for South African payments
 */
const crypto = require('crypto');
const axios = require('axios');

const isSandbox = process.env.PAYFAST_SANDBOX === 'true';

const PAYFAST_CONFIG = {
  merchantId: process.env.PAYFAST_MERCHANT_ID,
  merchantKey: process.env.PAYFAST_MERCHANT_KEY,
  passphrase: process.env.PAYFAST_PASSPHRASE || '',
  sandbox: isSandbox,
};

if (!PAYFAST_CONFIG.merchantId || !PAYFAST_CONFIG.merchantKey) {
  console.warn('⚠️ Missing PayFast credentials in environment variables');
}

// PayFast URLs
const PAYFAST_URL = PAYFAST_CONFIG.sandbox
  ? 'https://sandbox.payfast.co.za/eng/process'
  : 'https://www.payfast.co.za/eng/process';

const PAYFAST_VALIDATE_URL = PAYFAST_CONFIG.sandbox
  ? 'https://sandbox.payfast.co.za/eng/query/validate'
  : 'https://www.payfast.co.za/eng/query/validate';

/**
 * Generate MD5 signature for PayFast parameters
 * @param {object} data - Payment parameters (ordered)
 * @param {string} passphrase - Optional passphrase
 * @returns {string} MD5 signature
 */
const generateSignature = (data, passphrase = PAYFAST_CONFIG.passphrase) => {
  // PayFast signature rules (from official docs):
  //  - Exclude 'signature' and 'merchant_key' from the string
  //  - Sort remaining keys alphabetically
  //  - URL-encode values (spaces → +, not %20) — matches PHP urlencode()
  //  - Append &passphrase=... at the end if a passphrase is set
  const paramString = Object.keys(data)
    .filter((key) => key !== 'signature' && key !== 'merchant_key' && data[key] !== '' && data[key] != null)
    .sort()
    .map((key) => `${key}=${encodeURIComponent(String(data[key]).trim()).replace(/%20/g, '+')}`)
    .join('&');

  const sigString = passphrase
    ? `${paramString}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`
    : paramString;

  if (process.env.PAYFAST_DEBUG === 'true') {
    console.log('[PayFast] Signature string:', sigString);
  }

  return crypto.createHash('md5').update(sigString).digest('hex');
};

/**
 * Generate PayFast payment data for checkout
 * @param {object} order - Order details
 * @param {object} customer - Customer details
 * @returns {object} PayFast form data with signature
 */
const generatePaymentData = (order, customer) => {
  const apiUrl = process.env.API_URL || 'http://localhost:5000';

  const data = {
    merchant_id: PAYFAST_CONFIG.merchantId,
    merchant_key: PAYFAST_CONFIG.merchantKey,
    return_url: `${apiUrl}/api/payments/return?order_id=${order.id}`,
    cancel_url: `${apiUrl}/api/payments/cancel?order_id=${order.id}`,
    notify_url: `${apiUrl}/api/payments/notify`,
    name_first: customer.name?.split(' ')[0] || '',
    name_last: customer.name?.split(' ').slice(1).join(' ') || '',
    email_address: customer.email || '',
    m_payment_id: order.id,
    amount: parseFloat(order.total).toFixed(2),
    item_name: `Kasi Eats Order ${order.id.slice(0, 8)}`,
    item_description: `Food delivery order from vendor`,
  };

  // PayFast signature mismatch occurs if the HTML form sends empty fields 
  // that were excluded during the MD5 signature hash calculation.
  Object.keys(data).forEach(key => {
    if (data[key] === '' || data[key] === null || data[key] === undefined) {
      delete data[key];
    }
  });

  // Generate and append signature properly formatted
  data.signature = generateSignature(data);

  return {
    paymentUrl: PAYFAST_URL,
    paymentData: data,
  };
};

/**
 * Validate PayFast ITN (Instant Transaction Notification)
 * @param {object} pfData - POST data from PayFast
 * @returns {Promise<boolean>} Whether the ITN is valid
 */
const validateITN = async (pfData) => {
  try {
    // 1. Verify signature
    const pfParamString = Object.keys(pfData)
      .filter((key) => key !== 'signature' && key !== 'merchant_key')
      .sort()
      .map((key) => `${key}=${encodeURIComponent(String(pfData[key]).trim()).replace(/%20/g, '+')}`)
      .join('&');

    let sigString = pfParamString;
    if (PAYFAST_CONFIG.passphrase) {
      sigString += `&passphrase=${encodeURIComponent(PAYFAST_CONFIG.passphrase.trim()).replace(/%20/g, '+')}`;
    }

    const calculatedSig = crypto.createHash('md5').update(sigString).digest('hex');
    if (calculatedSig !== pfData.signature) {
      console.error('PayFast ITN: Invalid signature');
      return false;
    }

    // 2. Confirm with PayFast server
    const response = await axios.post(PAYFAST_VALIDATE_URL, pfParamString, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return response.data === 'VALID';
  } catch (error) {
    console.error('PayFast ITN validation error:', error.message);
    return false;
  }
};

/**
 * Calculate commission split
 * Platform takes 15%, vendor gets 85%
 */
const calculateCommission = (amount) => {
  const total = parseFloat(amount);
  const commission = Math.round(total * 0.15 * 100) / 100;
  const vendorPayout = Math.round((total - commission) * 100) / 100;
  return { commission, vendorPayout };
};

module.exports = {
  PAYFAST_CONFIG,
  PAYFAST_URL,
  generateSignature,
  generatePaymentData,
  validateITN,
  calculateCommission,
};
