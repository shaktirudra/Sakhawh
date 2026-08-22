const config = require('./config');
const logger = require('./logger');
const { WAMessageStubType } = require('@whiskeysockets/baileys');
const { getCollection } = require('./database');
const { toWhatsAppJid, jidToPhone, sleep } = require('./utils');

function unwrapMessage(message) {
  let content = message || {};
  for (let i = 0; i < 3; i += 1) {
    const wrapper = content.ephemeralMessage || content.viewOnceMessage || content.viewOnceMessageV2 || content.documentWithCaptionMessage;
    if (!wrapper?.message) break;
    content = wrapper.message;
  }
  return content;
}

function getMessageInfo(msg) {
  const content = unwrapMessage(msg.message);
  const entries = [
    ['conversation', 'text'], ['extendedTextMessage', 'text'], ['imageMessage', 'image'],
    ['videoMessage', 'video'], ['audioMessage', 'audio'], ['documentMessage', 'document'],
    ['stickerMessage', 'sticker'], ['contactMessage', 'contact'], ['contactsArrayMessage', 'contact'],
    ['locationMessage', 'location'], ['liveLocationMessage', 'location']
  ];
  const entry = entries.find(([key]) => content[key] !== undefined);
  if (!entry) return { type: 'other', payload: {}, text: '', caption: '' };
  const payload = entry[0] === 'conversation' ? {} : content[entry[0]] || {};
  return {
    type: entry[1],
    payload,
    text: entry[0] === 'conversation' ? content.conversation : payload.text || '',
    caption: payload.caption || ''
  };
}

function displayTime(value) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: config.TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(value);
}

async function cacheMessage(msg, senderOverride) {
  const collection = getCollection('message_cache');
  if (!collection || !msg?.key?.id) return;
  const info = getMessageInfo(msg);
  if (config.DEBUG_EVENTS) logger.debug(`Message ID: ${msg.key.id} Remote JID: ${msg.key.remoteJid || 'unknown'} Message type: ${info.type}`);

  const timestamp = new Date(Number(msg.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000);
  await collection.updateOne(
    { messageId: msg.key.id },
    {
      $set: {
        messageId: msg.key.id,
        key: msg.key,
        chatId: msg.key.remoteJid,
        senderJid: senderOverride || msg.key.participant || msg.key.remoteJid,
        senderPhone: jidToPhone(senderOverride || msg.key.participant || msg.key.remoteJid),
        fromMe: Boolean(msg.key.fromMe),
        messageType: info.type,
        text: info.text,
        caption: info.caption,
        mediaMetadata: info.payload ? {
          mimetype: info.payload.mimetype || null,
          fileLength: info.payload.fileLength || null,
          fileName: info.payload.fileName || null,
          seconds: info.payload.seconds || null
        } : null,
        pushName: msg.pushName || null,
        quotedMessageId: info.payload?.contextInfo?.stanzaId || null,
        timestamp,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + config.MESSAGE_CACHE_TTL_SECONDS * 1000)
      }
    },
    { upsert: true }
  );
}

async function handleDeletion(sock, update) {
  if (!update?.keys) return;
  if (config.DEBUG_EVENTS) logger.debug('Message deletion/update event received');
  const collection = getCollection('message_cache');
  if (!collection) return;

  for (const key of update.keys) {
    const chatId = key.remoteJid || '';
    if (config.DEBUG_EVENTS) logger.debug(`Message ID: ${key.id || 'unknown'} Chat ID: ${chatId} Sender: ${jidToPhone(key.participant || chatId) || 'unknown'}`);
    if (chatId.endsWith('@g.us') || chatId === 'status@broadcast') continue;
    const sender = jidToPhone(key.participant || chatId);
    if (key.fromMe && !config.ALERT_OWNER_SELF_DELETE) continue;
    if (sender === config.OWNER_NUMBER_DIGITS && !config.ALERT_OWNER_SELF_DELETE) continue;

    const cached = await collection.findOne({ messageId: key.id });
    if (cached) logger.info('Deleted message matched in MongoDB cache.');
    else logger.warn('Deleted message received but original message was not found in cache.');
    const type = cached?.messageType || cached?.type || 'other';
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    await sendDeleteAlert(sock, { sender, label, cached });
    logger.warn(`Message deletion detected: ${key.id}`);
  }
}

async function handleMessageUpdates(sock, updates) {
  for (const item of updates || []) {
    const protocol = unwrapMessage(item.update?.message).protocolMessage;
    const isRevoke = item.update?.messageStubType === WAMessageStubType.REVOKE || Number(protocol?.type) === 0;
    const key = item.update?.key || protocol?.key || item.key;
    if (!isRevoke || !key?.id) continue;
    if (config.DEBUG_EVENTS) logger.debug(`Possible deletion/revoke event received for message ${key.id}`);
    await handleDeletion(sock, { keys: [key] });
  }
}

async function sendDeleteAlert(sock, { sender, label, cached }) {
  const alertJid = toWhatsAppJid(config.DELETE_ALERT_NUMBER_DIGITS);
  if (!alertJid) throw new Error('DELETE_ALERT_NUMBER is missing or invalid');
  const original = label === 'Text' && cached?.text
    ? `\n📝 Original message:\n${cached.text}`
    : label === 'Text'
      ? '\n⚠️ Original content was unavailable.'
      : cached?.caption
        ? `\n📝 Caption:\n${cached.caption}\n\n⚠️ Original ${label.toLowerCase()} content was not stored.`
        : `\n⚠️ Original ${label.toLowerCase()} content was not stored.`;
  const alert = `╭━━━━━━━━━━━━━━━━━━━━━━╮\n     ⚠️ MESSAGE DELETED\n╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n👤 From:\n+${sender || 'Unknown'}\n\n💬 Type:\n${label}\n\n🕐 Time:\n${displayTime(cached?.timestamp || new Date())}${original}\n\n━━━━━━━━━━━━━━━━━━━━━━\nSAKHAAI SECURITY MONITOR`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await sock.sendMessage(alertJid, { text: alert });
      logger.info('Deleted-message alert sent to configured monitor number.');
      return;
    } catch (error) {
      if (attempt === 3) {
        logger.error(`Failed to send deleted-message alert: ${error?.message || error}`);
        return;
      }
      await sleep(attempt * 1000);
    }
  }
}

module.exports = { cacheMessage, handleDeletion, sendDeleteAlert };
