const rateLimit = require('express-rate-limit');

/**
 * Key generator combining IP and User ID for robust rate limiting
 */
const customKeyGenerator = (req) => {
  if (req.user && req.user.id) {
    return `${req.ip}_${req.user.id}`;
  }
  return req.ip;
};

/**
 * Default global limiter for public endpoints
 */
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP/User to 100 requests per `window`
  keyGenerator: customKeyGenerator,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Stricter limiter for authentication routes to prevent brute-forcing
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP/User to 15 authentication attempts per `window`
  keyGenerator: customKeyGenerator,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { publicLimiter, authLimiter };
