const { getKnowledgeContext } = require('./knowledge');
const { generateAIResponse } = require('./ai');
const { handleCommand, isCommand } = require('./commands');
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

    logger.info(`Received private message from ${remoteJid.split('@')[0]}: ${text.substring(0, 30)}...`);

    // Check command router
    if (isCommand(text)) {
      await handleCommand(sock, remoteJid, text);
      return;
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
