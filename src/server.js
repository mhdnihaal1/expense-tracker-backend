const mongoose = require('mongoose');
const { port, mongoUri } = require('./config');
const { createApp } = require('./app');
const { startScheduler } = require('./services/recurring');

async function main() {
  await mongoose.connect(mongoUri);
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  startScheduler();
  createApp().listen(port, '0.0.0.0', () => console.log(`API listening on http://localhost:${port}/api`));
}

main().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
