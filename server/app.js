const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const securityHeaders = require('./middleware/securityHeaders');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security and body parsers with size caps (Phase 3.B)
app.use(securityHeaders);
app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: true, limit: '500kb' }));
app.use(cookieParser());

// Static file caching headers
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: true,
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// API Routes
app.use('/api', require('./routes'));

// Compatibility fallbacks for top-level routes previously used directly
app.use('/api/warden', require('./routes/wardenRoutes'));
app.use('/api/terminal', require('./routes/terminalRoutes'));
app.use('/api/coordinator', require('./routes/coordinatorRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/leaderboard', require('./routes/leaderboardRoutes'));

// SPA fallback for frontend routes: /, /coordinator, /admin, /leaderboard
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Central error middleware (Phase 3.D)
app.use(errorHandler);

module.exports = app;
