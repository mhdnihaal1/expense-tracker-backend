require('dotenv').config({ quiet: true });

module.exports = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/expense_tracker',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  // Web origins allowed to call the API (comma-separated). Native apps send no Origin header.
  corsOrigins: (process.env.CORS_ORIGINS || 'https://expense-tracker-frontend-beryl-psi.vercel.app')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
};
