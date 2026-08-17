const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const dataPath = path.join(__dirname, '../data/data.json');

// Simple caching to reduce FS hits
let cachedData = null;
let lastReadTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

function validateAndFormat(data) {
  // Basic validation and fallbacks
  const business = data.business || {};
  const website = data.website || {};
  const contact = data.contact || {};
  const services = Array.isArray(data.services) ? data.services : [];
  const faq = Array.isArray(data.faq) ? data.faq : [];

  return {
    business,
    website,
    services,
    contact,
    faq
  };
}

function getKnowledgeContext() {
  try {
    const now = Date.now();
    if (cachedData && (now - lastReadTime < CACHE_TTL)) {
      return cachedData;
    }

    if (!fs.existsSync(dataPath)) {
      logger.warn('data.json not found in data directory.');
      cachedData = 'No specific business data available.';
      lastReadTime = now;
      return cachedData;
    }

    const rawData = fs.readFileSync(dataPath, 'utf-8');
    let parsedData;
    try {
      parsedData = JSON.parse(rawData);
    } catch (err) {
      logger.error(`KnowledgeBaseError: Failed to parse data.json - ${err.message}`);
      cachedData = 'Error loading business data. Assume standard polite responses.';
      lastReadTime = now;
      return cachedData;
    }

    const formatted = validateAndFormat(parsedData);
    cachedData = JSON.stringify(formatted, null, 2);
    lastReadTime = now;
    return cachedData;
  } catch (error) {
    logger.error(`KnowledgeBaseError: ${error?.message || error}`);
    return 'Error loading business data. Assume standard polite responses.';
  }
}

module.exports = { getKnowledgeContext };
