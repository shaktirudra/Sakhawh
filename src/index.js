const express = require('express');
const { startBot } = require('./bot');
const config = require('./config');
const logger = require('./logger');

const app = express();

// Health check endpoints for Railway
app.get('/', (req, res) => {
  res.send(`${config.BOT_NAME} is running.`);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'whatsapp-ai-bot',
    uptime: process.uptime()
  });
});

let server = null;

async function attemptListen(startPort, maxAttempts = 5) {
  let port = Number(startPort) || 3000;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      server = app.listen(port, () => {
        logger.info(`Web server running on port ${port}`);
        logger.info('Starting WhatsApp bot initialized...');
        startBot();
      });

      server.on('error', (err) => {
        logger.error(`Server error: ${err.message}`);
      });

      return;
    } catch (err) {
      if (err && err.code === 'EADDRINUSE') {
        logger.warn(`Port ${port} in use, trying ${port + 1}...`);
        port += 1;
        continue;
      }
      logger.error(`Failed to start server: ${err?.message || err}`);
      process.exit(1);
    }
  }

  logger.error('Could not bind any port, exiting.');
  process.exit(1);
}

// Graceful shutdown handling
async function shutdown(signal) {
  logger.info(`${signal} received. Shutting down gracefully.`);
  if (server && server.close) {
    server.close(() => {
      process.exit(0);
    });
    // give process 5s to exit
    setTimeout(() => process.exit(0), 5000);
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start listening, with fallback if port is occupied
attemptListen(config.PORT, 10);
