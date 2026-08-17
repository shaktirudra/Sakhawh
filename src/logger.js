const config = require('./config');

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLevel = levels[config.LOG_LEVEL] ?? levels.info;

const logger = {
  info: (msg) => {
    if (currentLevel >= levels.info) {
      console.log(`[INFO] ${new Date().toISOString()} - ${msg}`);
    }
  },
  warn: (msg) => {
    if (currentLevel >= levels.warn) {
      console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`);
    }
  },
  error: (msg) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`);
  },
  debug: (msg) => {
    if (currentLevel >= levels.debug) {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`);
    }
  }
};

module.exports = logger;
