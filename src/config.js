require('dotenv').config();

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY_TEXT || '';
const OPENAI_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

const AI_PROVIDER = (process.env.AI_PROVIDER || '').toLowerCase();
const AI_API_KEY = OPENROUTER_KEY || OPENAI_KEY || GEMINI_KEY || '';
const AI_BASE_URL = process.env.AI_BASE_URL || (AI_PROVIDER === 'openrouter' || OPENROUTER_KEY ? 'https://openrouter.ai/api/v1' : undefined);
const AI_MODEL = process.env.AI_MODEL || process.env.OPENAI_MODEL || process.env.GEMINI_MODEL || (AI_PROVIDER === 'openrouter' ? 'openai/gpt-4o-mini' : 'gpt-4o-mini');

module.exports = {
  AI_API_KEY,
  AI_BASE_URL,
  AI_MODEL,
  PHONE_NUMBER: process.env.PHONE_NUMBER || '',
  BOT_NAME: process.env.BOT_NAME || 'SakhaAI',
  PORT: process.env.PORT || 3000,
  LOG_LEVEL: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  ADMIN_NUMBERS: process.env.ADMIN_NUMBERS || '',
  AI_PROVIDER
};
