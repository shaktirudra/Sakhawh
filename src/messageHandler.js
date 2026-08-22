const { getKnowledgeContext } = require('./knowledge');
const { generateAIResponse } = require('./ai');
const { handleCommand, isCommand } = require('./commands');
const { isOrderRequest, handleOrderRequest } = require('./orders');
const logger = require('./logger');
const { getCollection } = require('./database');
const { cacheMessage } = require('./deletionMonitor');
const { isOwner } = require('./utils');
const config = require('./config');

async function handleMessage(sock, msg) {
  try {
    const chatId = msg.key.remoteJid;
    const senderJid = msg.key.fromMe ? sock.user?.id : msg.key.senderPn || msg.key.participant || chatId;

    if (
      !chatId ||
      !senderJid ||
      chatId.endsWith('@g.us') ||
      chatId === 'status@broadcast' ||
      chatId.includes('@broadcast')
    ) {
      return;
    }

    await cacheMessage(msg, senderJid).catch(error => logger.warn(`Message cache failed: ${error?.message || error}`));

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!text) return;
    if (msg.key.fromMe && !isCommand(text)) return;

    logger.info(`Received private message from ${senderJid.split('@')[0]}`);

    const userStates = getCollection('user_states');
    const userId = senderJid.split('@')[0];
    const userState = await userStates?.findOne({ userId });
    if (userState?.pausedUntil) {
      if (userState.pausedUntil > new Date()) {
        const command = text.trim().slice(1).split(/\s+/)[0].toLowerCase();
        const ownerCommand = ['msz', 'fstop', 'fstart'].includes(command) && isOwner(senderJid, config.OWNER_NUMBER);
        if (command !== 'start' && !ownerCommand) return;
      } else {
        await userStates.updateOne({ userId, pausedUntil: userState.pausedUntil }, { $set: { pausedUntil: null, updatedAt: new Date() } });
      }
    }

    if (isCommand(text)) {
      await handleCommand(sock, chatId, text, senderJid);
      return;
    }

    const globalState = await getCollection('bot_state')?.findOne({ key: 'global' });
    if (globalState?.stopped) return;


    // Check for order request FIRST (highest priority)
    if (isOrderRequest(text)) {
      logger.info('🛍️ Order request detected - processing...');
      try {
        const orderHandled = await handleOrderRequest(sock, chatId, text);
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
      await sock.presenceSubscribe(chatId);
      await sock.sendPresenceUpdate('composing', chatId);
    } catch (e) {
      logger.debug('Presence update not available or failed.');
    }

    const knowledge = getKnowledgeContext();
    const aiResponse = await generateAIResponse(text, knowledge);

    // Remove typing indicator
    try {
      await sock.sendPresenceUpdate('paused', chatId);
    } catch (e) {
      // ignore
    }

    if (aiResponse) {
      await sock.sendMessage(chatId, { text: aiResponse }, { quoted: msg });
    } else {
      await sock.sendMessage(chatId, { text: '⚠️ AI service is currently unavailable. Please try again later.' }, { quoted: msg });
    }

  } catch (error) {
    logger.error(`MessageProcessingError: ${error?.message || error}`);
  }
}

module.exports = { handleMessage };
