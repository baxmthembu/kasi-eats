/**
 * Vuka Eats — Main Server Entry Point
 * Express API server with Socket.IO for real-time features
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const xss = require('xss-clean');
const { publicLimiter } = require('./src/middleware/rateLimiter');

// Import routes
const authRoutes = require('./src/routes/auth');
const vendorRoutes = require('./src/routes/vendors');
const vendorPromotionsRoutes = require('./src/routes/vendorPromotions');
const vendorAnalyticsRoutes = require('./src/routes/vendorAnalytics');
const orderRoutes = require('./src/routes/orders');
const paymentRoutes = require('./src/routes/payments');
const reviewRoutes = require('./src/routes/reviews');
const driverRoutes = require('./src/routes/drivers');
const customerRoutes = require('./src/routes/customers');
const mapsRoutes = require('./src/routes/maps');
const adminRoutes = require('./src/routes/admin');
const messagesRoutes = require('./src/routes/messages');
const vendorPayoutsRoutes = require('./src/routes/vendorPayouts');

// Import WebSocket handler
const { setupWebSocket } = require('./src/websocket/handler');

const app = express();
const server = http.createServer(app);

// ─── CORS Origins ─────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:19000,http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

// ─── Socket.IO Setup ───────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

// Make io accessible in routes
app.set('io', io);

// ─── HTTPS Enforcement (production only) ──────────────────
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.get('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.get('host')}${req.url}`);
    }
    next();
  });
}

// ─── Security Middleware ───────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // No 'unsafe-inline' — PayFast form uses meta-refresh redirect instead of inline script
        'script-src': ["'self'"],
        'form-action': ["'self'", 'https://*.payfast.co.za'],
      },
    },
  })
);

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  })
);

// Data Sanitization against XSS
app.use(xss());

// Rate limiting — Apply global public limiter API-wide
app.use('/api/', publicLimiter);

// ─── Request Timeout ───────────────────────────────────────
app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    if (!res.headersSent) res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

// ─── Body Parsing ──────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ─── API Routes ────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorPromotionsRoutes);
app.use('/api/vendors/analytics', vendorAnalyticsRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/maps', mapsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api', vendorPayoutsRoutes);

// ─── Email Verified Landing Page ───────────────────────────
app.get('/email-verified', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Email Verified — Vuka Eats</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #FFF7ED;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      padding: 48px 32px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .icon { font-size: 64px; margin-bottom: 24px; }
    h1 { font-size: 24px; color: #1a1a1a; margin-bottom: 12px; font-weight: 700; }
    p { font-size: 15px; color: #666; line-height: 1.6; margin-bottom: 32px; }
    .btn {
      display: inline-block;
      background: #F97316;
      color: #fff;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 15px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Email Verified!</h1>
    <p>Your Vuka Eats account has been confirmed. You can now return to the app and log in.</p>
    <a href="kasieats://auth-callback" class="btn">Open Vuka Eats App</a>
  </div>
</body>
</html>`);
});

// ─── Health Check ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'kasi-eats-api',
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 Handler ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global Error Handler ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ─── WebSocket Setup ───────────────────────────────────────
setupWebSocket(io);

// ─── Dispatch offer expiry cron (every 10s) ────────────────
const { expirePendingOffers } = require('./src/services/dispatchService');
const offerExpiryInterval = setInterval(() => expirePendingOffers(io), 10000);

// ─── Weekly payout cron (Sundays 23:00 server time) ───────
const { registerPayoutCron } = require('./cron-jobs/weeklyPayouts');
registerPayoutCron(io);

// ─── Graceful Shutdown ─────────────────────────────────────
const shutdown = (signal) => {
  console.log(`\n${signal} received — shutting down gracefully`);
  clearInterval(offerExpiryInterval);
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  // Force exit after 10s if connections don't close
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Start Server ──────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Vuka Eats API running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, server, io };
