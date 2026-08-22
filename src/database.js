const { MongoClient } = require('mongodb');
const config = require('./config');
const logger = require('./logger');

let client = null;
let database = null;
let retryTimer = null;

async function initDatabase() {
  if (database) return true;
  if (!config.MONGODB_URI) {
    logger.error('MongoDB is not configured. Set MONGODB_URI and MONGODB_DB.');
    return false;
  }

  try {
    client = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    database = client.db(config.MONGODB_DB);
    await Promise.all([
      database.collection('user_states').createIndex({ userId: 1 }, { unique: true }),
      database.collection('bot_state').createIndex({ key: 1 }, { unique: true }),
      database.collection('scheduled_messages').createIndex({ status: 1, scheduledAt: 1 }),
      database.collection('scheduled_messages').createIndex({ status: 1, processingStartedAt: 1 }),
      database.collection('message_cache').createIndex({ messageId: 1 }, { unique: true }),
      database.collection('message_cache').createIndex({ chatId: 1, timestamp: 1 }),
      database.collection('message_cache').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      database.collection('message_cache').createIndex({ createdAt: 1 }, { expireAfterSeconds: config.MESSAGE_CACHE_TTL_SECONDS })
    ]);
    logger.info(`MongoDB connected: ${config.MONGODB_DB}`);
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    return true;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error?.message || error}`);
    database = null;
    if (client) await client.close().catch(() => {});
    client = null;
    if (!retryTimer) retryTimer = setTimeout(() => { retryTimer = null; initDatabase(); }, 30000);
    return false;
  }
}

function getCollection(name) {
  if (!database) return null;
  return database.collection(name);
}

async function closeDatabase() {
  if (client) await client.close();
  client = null;
  database = null;
}

module.exports = { initDatabase, getCollection, closeDatabase };
