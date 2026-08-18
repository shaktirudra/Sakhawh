const { getKnowledgeContext } = require('./knowledge');
const { generateAIResponse } = require('./ai');
const { handleCommand, isCommand } = require('./commands');
const { isOrderRequest, handleOrderRequest } = require('./orders');
const logger = require('./logger');

async function handleMessage(sock, msg) {
  try {
    const remoteJid = msg.key.remoteJid;

    // 5. PRIVATE CHAT ONLY: Ignore groups, status updates, and broadcasts
    if (
      remoteJid.endsWith('@g.us') ||
      remoteJid === 'status@broadcast' ||
      remoteJid.includes('@broadcast')
    ) {
      return;
    }

    // Extract text message (covers standard text and extended text)
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!text) return; // Gracefully ignore media/polls/locations for now

    logger.info(`Received private message from ${remoteJid.split('@')[0]}: ${text.substring(0, 50)}...`);

    // Check command router
    if (isCommand(text)) {
      await handleCommand(sock, remoteJid, text);
      return;
    }

    // Check for order request FIRST (highest priority)
    if (isOrderRequest(text)) {
      logger.info('🛍️ Order request detected - processing...');
      try {
        const orderHandled = await handleOrderRequest(sock, remoteJid, text);
        if (orderHandled) {
          logger.info('✅ Order confirmed and saved successfully');
          // Continue to AI for additional handling if needed
        } else {
          logger.warn('⚠️ Order detection triggered but handling failed');
        }
      } catch (orderError) {
        logger.error(`Order processing error: ${orderError?.message || orderError}`);
      }
    }

    // Rate limiting / debounce placeholder (simple per-message guard)
    // UX: Show typing indicator (if supported)
    try {
      await sock.presenceSubscribe(remoteJid);
      await sock.sendPresenceUpdate('composing', remoteJid);
    } catch (e) {
      logger.debug('Presence update not available or failed.');
    }

    const knowledge = getKnowledgeContext();
    const aiResponse = await generateAIResponse(text, knowledge);

    // Remove typing indicator
    try {
      await sock.sendPresenceUpdate('paused', remoteJid);
    } catch (e) {
      // ignore
    }

    if (aiResponse) {
      await sock.sendMessage(remoteJid, { text: aiResponse }, { quoted: msg });
    } else {
      await sock.sendMessage(remoteJid, { text: '⚠️ AI service is currently unavailable. Please try again later.' }, { quoted: msg });
    }

  } catch (error) {
    logger.error(`MessageProcessingError: ${error?.message || error}`);
  }
}

module.exports = { handleMessage };
