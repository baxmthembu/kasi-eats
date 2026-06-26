/**
 * Auth Routes
 * Registration, Login, and Profile Management
 */
const express = require('express');
const { body, validationResult, checkExact } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { supabase, supabaseAnon } = require('../config/supabase');
const { authenticate, authorize } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

// Common validation checks
const validateRegister = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isString().isLength({ min: 6, max: 128 }).withMessage('Password must be between 6 and 128 characters'),
  body('name').isString().trim().notEmpty().isLength({ max: 100 }).withMessage('Name is required and strictly limited in length'),
  body('phone').optional().isString().trim().notEmpty().isLength({ max: 20 }).withMessage('Phone is required'),
  body('role').isIn(['customer', 'driver', 'vendor']).withMessage('Invalid role'),
  // Vendor specific required fields (made optional for other roles)
  body('description').optional().isString().trim().notEmpty().isLength({ max: 1000 }).withMessage('Description is required'),
  body('address').optional().isString().trim().notEmpty().isLength({ max: 255 }).withMessage('Address is required'),
  body('cover_image').optional().notEmpty().withMessage('Cover image is required'),
  body('is_open').optional().isBoolean().withMessage('Shop open status is required')
];

/**
 * Register User
 * POST /api/auth/register
 */
router.post('/register', authLimiter, checkExact(validateRegister), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password, name, phone, role, description, address, cover_image, delivery_radius_km, min_order_amount, is_open } = req.body;

  try {
    // 1. Register with Supabase Auth — signUp() sends the verification email automatically
    const { data: authData, error: authError } = await supabaseAnon.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: process.env.EMAIL_REDIRECT_URL || 'kasieats://auth-callback',
      },
    });

    if (authError) return res.status(400).json({ error: authError.message });
    if (!authData.user) return res.status(400).json({ error: 'Registration failed' });

    const userId = authData.user.id;
    const passwordHash = await bcrypt.hash(password, 10);

    // 2. Insert into users table
    const { data: user, error: dbError } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        password_hash: passwordHash,
        name,
        phone,
        role,
      })
      .select()
      .single();

     if (dbError) {
       // Rollback Auth creation if DB fails
       await supabase.auth.admin.deleteUser(userId);
       return res.status(500).json({ error: 'Failed to create user profile' });
     }

      // 3. If vendor, also create vendor profile
      if (role === 'vendor') {
        const { error: vendorError } = await supabase
          .from('vendors')
          .insert({
            user_id: userId,
            business_name: name,
            description: description,
            address: address,
            phone: phone,
            cover_image: cover_image,
            is_open: is_open
          });

       if (vendorError) {
         // Rollback everything if vendor profile fails
         await supabase.auth.admin.deleteUser(userId);
         await supabase.from('users').delete().eq('id', userId);
         return res.status(500).json({ error: 'Failed to create vendor profile' });
       }
     }

     // 3b. If driver, create driver profile and initial location
     if (role === 'driver') {
       const { error: profileError } = await supabase.from('driver_profiles').insert({
         user_id: userId,
       });
       const { error: locError } = await supabase.from('driver_locations').insert({
         driver_id: userId,
         latitude: -26.2041,
         longitude: 28.0473,
         is_online: false,
       });
       if (profileError || locError) {
         await supabase.auth.admin.deleteUser(userId);
         await supabase.from('users').delete().eq('id', userId);
         return res.status(500).json({ error: 'Failed to create driver profile' });
       }
     }

     // 4. Return success — client must verify email before logging in
     res.status(201).json({ user, requiresEmailVerification: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error during registration' });
  }
});

/**
 * Login
 * POST /api/auth/login
 */
router.post('/login', authLimiter, checkExact([
  body('email').isEmail().normalizeEmail(),
  body('password').isString().notEmpty().isLength({ max: 128 })
]), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;

  try {
    // Grab user from public table
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account disabled' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Verify email is confirmed before issuing a token
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(user.id);
    if (authUser && !authUser.email_confirmed_at) {
      return res.status(403).json({
        error: 'Please verify your email address before logging in.',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
      });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    // Remove hash from response
    delete user.password_hash;
    
    res.json({ user, token });
  } catch (error) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

/**
 * Get Profile
 * GET /api/auth/profile
 */
router.get('/profile', authenticate, (req, res) => {
  res.json({ user: req.user });
});

/**
 * Logout — revokes the current token and all Supabase sessions
 * POST /api/auth/logout
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Blacklist the current token so it can't be reused within its 7-day window
    await supabase.from('token_blacklist').upsert(
      {
        token_hash: tokenHash,
        user_id: req.user.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'token_hash' }
    );

    // Invalidate all active Supabase sessions for this user
    await supabase.auth.admin.signOut(req.user.id);

    // Clean up expired blacklist entries opportunistically
    await supabase.from('token_blacklist').delete().lt('expires_at', new Date().toISOString());

    res.json({ success: true });
  } catch (err) {
    console.error('[auth] logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * Forgot Password — sends a Supabase password-reset email
 * POST /api/auth/forgot-password  (no auth required)
 */
router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email, redirectTo } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  // Fire and forget — always respond 200 to prevent email enumeration
  supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo || process.env.EMAIL_REDIRECT_URL?.replace('auth-callback', 'reset-password') || 'kasieats://reset-password',
  }).catch(() => {});

  res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
});

/**
 * Track Session — called by the client after a successful Supabase sign-in
 * POST /api/auth/sessions/track
 */
router.post('/sessions/track', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    let sessionId = null;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      sessionId = payload.session_id || null;
    } catch {}

    await supabase.from('user_sessions').upsert(
      {
        user_id: req.user.id,
        supabase_session_id: sessionId,
        device_info: req.headers['user-agent'] || 'Unknown device',
        ip_address: (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim(),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'supabase_session_id', ignoreDuplicates: false }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not track session' });
  }
});

/**
 * List Sessions — returns all active sessions for the current user
 * GET /api/auth/sessions
 */
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    let currentSessionId = null;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      currentSessionId = payload.session_id || null;
    } catch {}

    const { data: sessions, error } = await supabase
      .from('user_sessions')
      .select('id, supabase_session_id, device_info, ip_address, created_at, last_seen_at')
      .eq('user_id', req.user.id)
      .order('last_seen_at', { ascending: false });

    if (error) throw error;

    res.json({
      sessions: (sessions || []).map(s => ({
        ...s,
        is_current: currentSessionId && s.supabase_session_id === currentSessionId,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch sessions' });
  }
});

/**
 * Revoke a specific session
 * DELETE /api/auth/sessions/:sessionId
 */
router.delete('/sessions/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data: session } = await supabase
      .from('user_sessions')
      .select('id, supabase_session_id')
      .eq('id', sessionId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (!session) return res.status(404).json({ error: 'Session not found' });

    await supabase.from('user_sessions').delete().eq('id', sessionId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not revoke session' });
  }
});

/**
 * Revoke all sessions except the current one
 * DELETE /api/auth/sessions
 */
router.delete('/sessions', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    let currentSessionId = null;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      currentSessionId = payload.session_id || null;
    } catch {}

    let query = supabase.from('user_sessions').delete().eq('user_id', req.user.id);
    if (currentSessionId) {
      query = query.neq('supabase_session_id', currentSessionId);
    }
    await query;

    // Sign out all other Supabase sessions
    await supabase.auth.admin.signOut(req.user.id).catch(() => {});

    res.json({ success: true, message: 'All other sessions have been revoked.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not revoke sessions' });
  }
});

/**
 * Resend email verification
 * POST /api/auth/resend-verification
 */
router.post('/resend-verification', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const { error } = await supabaseAnon.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: process.env.EMAIL_REDIRECT_URL || 'kasieats://auth-callback',
      },
    });

    if (error) return res.status(400).json({ error: error.message });
    // Always return success to avoid email enumeration
    res.json({ success: true, message: 'Verification email sent if account exists.' });
  } catch (err) {
    console.error('[auth] resend-verification error:', err);
    res.status(500).json({ error: 'Could not send verification email' });
  }
});

module.exports = router;
