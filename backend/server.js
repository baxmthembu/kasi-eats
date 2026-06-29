/**
 * Street Plate — Main Server Entry Point
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
  <title>Email Verified — Street Plate</title>
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
    <p>Your Street Plate account has been confirmed. You can now return to the app and log in.</p>
    <a href="kasieats://auth-callback" class="btn">Open Street Plate App</a>
  </div>
</body>
</html>`);
});

// ─── Privacy Policy Page ───────────────────────────────────
app.get('/privacy', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy — Street Plate</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #FFF7ED; padding: 24px; color: #374151; }
    .container { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 20px; padding: 48px 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    h1 { font-size: 28px; color: #1a1a1a; margin-bottom: 8px; font-weight: 800; }
    .subtitle { font-size: 14px; color: #999; margin-bottom: 32px; }
    h2 { font-size: 16px; font-weight: 700; color: #1a1a1a; margin: 28px 0 10px; }
    p, li { font-size: 14px; line-height: 1.8; }
    ul { padding-left: 20px; margin-top: 8px; }
    a { color: #F97316; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Privacy Policy</h1>
    <p class="subtitle">Last updated: June 2025</p>
    <p>Street Plate is a trading name of KulaConnect (Pty) Ltd ("we", "us", or "our"), a company registered in the Republic of South Africa. We operate the Street Plate mobile applications. This policy explains how we collect, use, and protect your personal information.</p>
    <h2>1. Information We Collect</h2>
    <p>We collect information you provide directly: name, email address, phone number, delivery addresses, and payment information. We also collect location data (with your permission) to connect you with nearby vendors and track deliveries.</p>
    <h2>2. How We Use Your Information</h2>
    <ul>
      <li>To process and deliver your orders</li>
      <li>To connect customers with vendors and drivers</li>
      <li>To send order status updates and notifications</li>
      <li>To improve our services</li>
      <li>To comply with legal obligations</li>
    </ul>
    <h2>3. Location Data</h2>
    <p>Customer app: Location is used to find nearby vendors and provide delivery estimates. Used only while the app is active.<br/>Driver app: Location is used during active deliveries to show customers their order's progress. Background location is used only while you are marked as online.</p>
    <h2>4. Data Sharing</h2>
    <ul>
      <li>Vendors: to fulfil your orders (name, address, order details)</li>
      <li>Drivers: to complete deliveries (name, delivery address)</li>
      <li>Payment processors (PayFast): to process payments securely</li>
      <li>We do not sell your personal data to third parties.</li>
    </ul>
    <h2>5. Data Retention</h2>
    <p>We retain your data for as long as your account is active or as required by law. You may request deletion by contacting support.</p>
    <h2>6. Security</h2>
    <p>We use industry-standard encryption and Supabase's secure infrastructure to protect your data. Payment processing is handled by PayFast, a PCI-DSS compliant provider.</p>
    <h2>7. Your Rights</h2>
    <p>You have the right to access, correct, or delete your personal data. Contact us at <a href="mailto:privacy@streetplate.co.za">privacy@streetplate.co.za</a>.</p>
    <h2>8. Contact</h2>
    <p>Street Plate (a trading name of KulaConnect (Pty) Ltd)<br/>Email: <a href="mailto:privacy@streetplate.co.za">privacy@streetplate.co.za</a><br/>Website: <a href="https://www.streetplate.co.za">www.streetplate.co.za</a></p>
  </div>
</body>
</html>`);
});

// ─── Terms of Service Page ─────────────────────────────────
app.get('/terms', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Terms of Service — Street Plate</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #FFF7ED; padding: 24px; color: #374151; }
    .container { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 20px; padding: 48px 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    h1 { font-size: 28px; color: #1a1a1a; margin-bottom: 8px; font-weight: 800; }
    .subtitle { font-size: 14px; color: #999; margin-bottom: 32px; }
    h2 { font-size: 16px; font-weight: 700; color: #1a1a1a; margin: 28px 0 10px; }
    p, li { font-size: 14px; line-height: 1.8; }
    ul { padding-left: 20px; margin-top: 8px; }
    a { color: #F97316; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Terms of Service</h1>
    <p class="subtitle">Last updated: June 2025</p>
    <p>These Terms constitute a binding agreement between you and KulaConnect (Pty) Ltd, trading as Street Plate, a company registered in the Republic of South Africa.</p>
    <h2>1. Acceptance of Terms</h2>
    <p>By downloading or using the Street Plate app, you agree to these terms. If you do not agree, do not use the app.</p>
    <h2>2. The Service</h2>
    <p>Street Plate is a food ordering platform that connects customers with local food vendors. We facilitate the ordering and delivery process but are not the food vendor.</p>
    <h2>3. User Accounts</h2>
    <p>You must provide accurate information when creating an account. You are responsible for maintaining the security of your account credentials.</p>
    <h2>4. Ordering &amp; Payment</h2>
    <ul>
      <li>Orders are confirmed only after successful payment via PayFast.</li>
      <li>Prices displayed are final and inclusive of applicable taxes.</li>
      <li>The platform retains a 15% commission; vendors receive 85% of order value.</li>
    </ul>
    <h2>5. Cancellations &amp; Refunds (Consumer Protection Act)</h2>
    <p>In accordance with the Consumer Protection Act 68 of 2008, you may cancel an order within 5 minutes of placing it, provided the vendor has not yet started preparing it. Refund requests must be submitted within 24 hours to <a href="mailto:support@streetplate.co.za">support@streetplate.co.za</a>. Refunds are processed within 5–7 business days.</p>
    <h2>6. Delivery</h2>
    <p>Delivery times are estimates only. Street Plate is not liable for delays caused by circumstances beyond our control.</p>
    <h2>7. Vendor Obligations</h2>
    <p>Vendors are responsible for food quality, safety, and accurate descriptions. Street Plate retains a 15% commission on all completed orders, with payouts processed weekly.</p>
    <h2>8. Driver Obligations</h2>
    <p>Drivers must hold a valid PDP as required by the National Road Traffic Act. Drivers operate as independent contractors, not employees of Street Plate.</p>
    <h2>9. Governing Law</h2>
    <p>These terms are governed by the laws of the Republic of South Africa.</p>
    <h2>10. Contact</h2>
    <p>Street Plate (a trading name of KulaConnect (Pty) Ltd)<br/>Email: <a href="mailto:legal@streetplate.co.za">legal@streetplate.co.za</a><br/>Website: <a href="https://www.streetplate.co.za">www.streetplate.co.za</a></p>
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
  console.log(`🚀 Street Plate API running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, server, io };
