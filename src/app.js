const express = require('express');
const cors = require('cors');
const config = require('./config');
const { requireAuth } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/error');
const { catchUpRecurring } = require('./services/recurring');

// Vercel preview deployments, and the Expo dev server on localhost or the LAN.
const PREVIEW_ORIGIN = /^https:\/\/expense-tracker-frontend-[a-z0-9-]+-mhdnihaal1s-projects\.vercel\.app$/;
const LOCAL_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

function isAllowedOrigin(origin) {
  return !origin || config.corsOrigins.includes(origin) || PREVIEW_ORIGIN.test(origin) || LOCAL_ORIGIN.test(origin);
}

function createApp() {
  const app = express();
  app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) }));
  app.use(express.json({ limit: '200kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', require('./routes/auth'));

  const authed = [requireAuth, catchUpRecurring];
  app.use('/api/accounts', authed, require('./routes/accounts'));
  app.use('/api/categories', authed, require('./routes/categories'));
  app.use('/api/transactions', authed, require('./routes/transactions'));
  app.use('/api/budgets', authed, require('./routes/budgets'));
  app.use('/api/goals', authed, require('./routes/goals'));
  app.use('/api/recurring', authed, require('./routes/recurring'));
  app.use('/api/stats', authed, require('./routes/stats'));
  app.use('/api/export', authed, require('./routes/export'));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
