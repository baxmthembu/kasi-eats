/**
 * Authentication Middleware
 * JWT verification and role-based access control via Supabase
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Verify JWT token and attach user to request
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    // Check token blacklist (covers custom JWTs revoked on logout)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { data: blacklisted } = await supabase
      .from('token_blacklist')
      .select('id')
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (blacklisted) {
      return res.status(401).json({ error: 'Token has been revoked. Please log in again.' });
    }

    // Validate the token directly via Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !authData.user) {
      // Fallback: Check if it's a custom backend JWT instead
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { data: user, error } = await supabase
          .from('users')
          .select('id, email, name, phone, role, avatar_url, latitude, longitude, is_active')
          .eq('id', decoded.userId || decoded.sub)
          .single();

        if (error || !user) throw new Error('User not found');
        if (!user.is_active) return res.status(403).json({ error: 'Account has been deactivated.' });
        
        req.user = user;
        return next();
      } catch (fallbackError) {
        return res.status(401).json({ error: 'Invalid token.' });
      }
    }

    // Check email is verified for Supabase-issued tokens
    if (!authData.user.email_confirmed_at) {
      return res.status(403).json({
        error: 'Email not verified. Please check your inbox and click the confirmation link.',
        code: 'EMAIL_NOT_VERIFIED',
        email: authData.user.email,
      });
    }

    // Token is valid Supabase token, fetch full profile from public.users table
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, phone, role, avatar_url, latitude, longitude, is_active')
      .eq('id', authData.user.id)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'User profile not found.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account has been deactivated.' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

/**
 * Role-based access control middleware factory
 * @param  {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }
    next();
  };
};

module.exports = { authenticate, authorize };
