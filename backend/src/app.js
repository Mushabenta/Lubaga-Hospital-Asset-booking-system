const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
const env = require('./config/env');
const { success, notFound, errorConverter, errorHandler } = require('./middleware/error');

const app = express();

app.use(helmet());

// CORS - restrict to configured origins.
const allowedOrigins = env.corsOrigin;
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  })
);

app.use(express.json({ limit: '1mb' }));

// Global rate limiting.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.', error: 'RATE_LIMITED' }
});
app.use(globalLimiter);

// Stricter rate limit for authentication endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts, please try again later.', error: 'RATE_LIMITED' }
});

// Serve the single-page frontend statically from the repo root so the app and
// API share one origin (no CORS setup needed). Only the whitelisted files are
// exposed; the backend directory is never reachable through the public root.
const FRONTEND_ROOT = path.join(__dirname, '..', '..');
const PUBLIC_FRONTEND_FILES = new Set([
  'index.html',
  'register.html',
  'user-dashboard.html',
  'admin-dashboard.html',
  'lubaga logo.png'
]);

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let name;
  try {
    name = decodeURIComponent(req.path.replace(/^\/+/, ''));
  } catch (_) {
    name = '';
  }
  if (name === '') name = 'index.html';
  if (!PUBLIC_FRONTEND_FILES.has(name)) return next();
  return res.sendFile(path.join(FRONTEND_ROOT, name), (err) => {
    if (err && !res.headersSent) next(err);
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ success: true, status: 'ok' });
});

app.use('/api/auth', authLimiter);

app.get('/api', (req, res) => {
  success(res, {
    name: 'Lubaga Hospital Asset Booking API',
    version: '2.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      assets: '/api/assets',
      bookings: '/api/bookings',
      categories: '/api/categories',
      departments: '/api/departments',
      'audit-logs': '/api/audit-logs'
    }
  });
});

app.use('/api', routes);

app.use(notFound);
app.use(errorConverter);
app.use(errorHandler);

module.exports = app;
