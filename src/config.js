require('dotenv').config();

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY_TEXT || '';
const OPENAI_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const { normalizePhoneNumber } = require('./utils');

const AI_PROVIDER = (process.env.AI_PROVIDER || '').toLowerCase();
const AI_API_KEY = OPENROUTER_KEY || OPENAI_KEY || GEMINI_KEY || '';
const AI_BASE_URL = process.env.AI_BASE_URL || (AI_PROVIDER === 'openrouter' || OPENROUTER_KEY ? 'https://openrouter.ai/api/v1' : undefined);
const AI_MODEL = process.env.AI_MODEL || process.env.OPENAI_MODEL || process.env.GEMINI_MODEL || (AI_PROVIDER === 'openrouter' ? 'openai/gpt-4o-mini' : 'gpt-4o-mini');
const OWNER_NUMBER = process.env.OWNER_NUMBER || (process.env.ADMIN_NUMBERS || '').split(',')[0].trim();
const DELETE_ALERT_NUMBER = process.env.DELETE_ALERT_NUMBER || '';
const ALERT_OWNER_SELF_DELETE = process.env.DELETE_ALERT_OWNER_MESSAGES === 'true' || process.env.ALERT_OWNER_SELF_DELETE === 'true';

module.exports = {
  AI_API_KEY,
  AI_BASE_URL,
  AI_MODEL,
  PHONE_NUMBER: process.env.PHONE_NUMBER || '',
  OWNER_NUMBER,
  OWNER_NUMBER_DIGITS: normalizePhoneNumber(OWNER_NUMBER),
  DELETE_ALERT_NUMBER,
  DELETE_ALERT_NUMBER_DIGITS: normalizePhoneNumber(DELETE_ALERT_NUMBER),
  BOT_NAME: process.env.BOT_NAME || 'SakhaAI',
  PORT: process.env.PORT || 3000,
  LOG_LEVEL: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  ADMIN_NUMBERS: process.env.ADMIN_NUMBERS || '',
  AI_PROVIDER,
  MONGODB_URI: process.env.MONGODB_URI || '',
  MONGODB_DB: process.env.MONGODB_DB || process.env.MONGODB_DB_NAME || 'SAKHAAI',
  TIMEZONE: process.env.TIMEZONE || 'Asia/Kolkata',
  ALERT_OWNER_SELF_DELETE,
  DEBUG_EVENTS: process.env.DEBUG_EVENTS === 'true',
  MESSAGE_CACHE_TTL_SECONDS: Math.max(3600, Number(process.env.MESSAGE_CACHE_TTL_DAYS || 30) * 86400),
  SCHEDULER_INTERVAL_MS: Math.max(1000, Number(process.env.SCHEDULER_INTERVAL_MS || 3000))
};
