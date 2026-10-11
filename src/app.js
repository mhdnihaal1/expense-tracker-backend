const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/error');
const { catchUpRecurring } = require('./services/recurring');

function createApp() {
  const app = express();
  app.use(cors());
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
