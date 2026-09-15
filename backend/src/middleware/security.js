/**
 * Security Middleware
 * Input sanitization, XSS prevention, request size limits
 */

/**
 * Sanitize string inputs — strip HTML tags and dangerous characters
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
};

// Fields whose exact value must survive untouched — passwords are hashed/compared
// verbatim and must never be mutated before that happens, or a valid password
// containing '<', '>', or an on\w+= substring gets wrongly rejected by the
// complexity check (or, worse, silently changes what gets hashed).
const PRESERVE_EXACT_KEY = /password/i;

/**
 * Recursively sanitize all string values in an object
 */
const sanitizeObject = (obj) => {
  if (typeof obj === 'string') return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = PRESERVE_EXACT_KEY.test(key) ? value : sanitizeObject(value);
    }
    return sanitized;
  }
  return obj;
};

/**
 * Middleware to sanitize request body, query, and params
 */
const sanitizeInput = (req, res, next) => {
  if (req.body) req.body = sanitizeObject(req.body);
  if (req.query) req.query = sanitizeObject(req.query);
  if (req.params) req.params = sanitizeObject(req.params);
  next();
};

module.exports = { sanitizeInput, sanitizeString };
