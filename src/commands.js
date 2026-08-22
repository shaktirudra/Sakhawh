const config = require('./config');
const { normalizePhoneNumber, isOwner, toWhatsAppJid, jidToPhone } = require('./utils');
const { getCollection } = require('./database');
const logger = require('./logger');

const COMMAND_PREFIX = '.';

function isCommand(text) {
  return typeof text === 'string' && text.trim().startsWith(COMMAND_PREFIX);
}

function parseSchedule(text) {
  const parts = text.trim().split('|');
  if (parts.length < 4) return null;
  const dateText = parts[1].trim();
  const recipient = normalizePhoneNumber(parts[2].trim());
  const message = parts.slice(3).join('|').trim();
  const match = dateText.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match || !recipient || !message) return null;
  const [, day, month, year, hour, minute] = match.map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  const scheduledAt = new Date(Date.UTC(year, month - 1, day, hour, minute) - (5 * 60 + 30) * 60 * 1000);
  if (scheduledAt <= new Date()) return null;
  return { recipient: toWhatsAppJid(recipient), message, scheduledAt };
}

function scheduleUsage() {
  return '❌ Invalid format.\n\nUse:\n\n.msz | DD-MM-YYYY HH:mm | +91XXXXXXXXXX | Message';
}

async function handleCommand(sock, jid, text, sender = jid) {
  const command = text.slice(COMMAND_PREFIX.length).trim().split(/\s+/)[0].toLowerCase();
  const owner = isOwner(sender, config.OWNER_NUMBER);
  const userStates = getCollection('user_states');
  const botState = getCollection('bot_state');

  if (command === 'start') {
    if (!userStates) return sock.sendMessage(jid, { text: '⚠️ MongoDB is unavailable. Please try again later.' });
    await userStates.updateOne({ userId: jidToPhone(sender) }, { $set: { userId: jidToPhone(sender), pausedUntil: null, updatedAt: new Date() } }, { upsert: true });
    await sock.sendMessage(jid, { text: '▶️ SAKHAAI is active again.' });
  } else if (command === 'stop') {
    if (!userStates) return sock.sendMessage(jid, { text: '⚠️ MongoDB is unavailable. Please try again later.' });
    const pausedUntil = new Date(Date.now() + 10 * 60 * 1000);
    await userStates.updateOne({ userId: jidToPhone(sender) }, { $set: { userId: jidToPhone(sender), pausedUntil, updatedAt: new Date() } }, { upsert: true });
    await sock.sendMessage(jid, { text: '⏸️ SAKHAAI is paused for you for 10 minutes.\n\nYou can send .start at any time to resume.' });
  } else if (command === 'fstop' || command === 'fstart') {
    if (!owner) return sock.sendMessage(jid, { text: '⛔ Owner-only command.' });
    if (!botState) return sock.sendMessage(jid, { text: '⚠️ MongoDB is unavailable. Please try again later.' });
    const stopped = command === 'fstop';
    await botState.updateOne({ key: 'global' }, { $set: { key: 'global', stopped, updatedAt: new Date() } }, { upsert: true });
    await sock.sendMessage(jid, { text: stopped ? '⏸️ SAKHAAI has been stopped globally.' : '▶️ SAKHAAI has been started globally.\n\nNormal replies are now enabled.' });
  } else if (command === 'msz') {
    if (!owner) return sock.sendMessage(jid, { text: '⛔ Owner-only command.' });
    const schedule = parseSchedule(text);
    if (!schedule) return sock.sendMessage(jid, { text: scheduleUsage() });
    const collection = getCollection('scheduled_messages');
    if (!collection) return sock.sendMessage(jid, { text: '⚠️ MongoDB is unavailable. The message was not scheduled.' });
    const result = await collection.insertOne({
      ownerId: config.OWNER_NUMBER_DIGITS,
      recipient: normalizePhoneNumber(schedule.recipient),
      recipientJid: schedule.recipient,
      message: schedule.message,
      scheduledAt: schedule.scheduledAt,
      timezone: config.TIMEZONE,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
      processingStartedAt: null,
      sentAt: null,
      failedAt: null,
      lastError: null
    });
    logger.info(`Scheduled message created: ${result.insertedId}`);
    await sock.sendMessage(jid, { text: `✅ Message scheduled for ${schedule.scheduledAt.toISOString()} UTC (${config.TIMEZONE}).` });

  } else if (command === 'menu') {
    const ownerMenu = owner ? '\n\n━━━━━━━━━━━━━━━━━━━━━━\n\nOWNER COMMANDS\n\n.msz\n→ Schedule a WhatsApp message\n\n.fstop\n→ Stop bot replies globally\n\n.fstart\n→ Start bot replies globally\n\n━━━━━━━━━━━━━━━━━━━━━━' : '';
    const menuMessage = `╭━━━━━━━━━━━━━━━━━━━━━━╮\n       🤖 SAKHAAI\n╰━━━━━━━━━━━━━━━━━━━━━━╯\n\nGENERAL\n\n.start\n→ Enable bot replies\n\n.stop\n→ Pause replies for 10 minutes\n\n.menu\n→ Show this menu${ownerMenu}`;
    await sock.sendMessage(jid, { text: menuMessage });

  } else if (command === 'about') {
    await sock.sendMessage(jid, { text: `🤖 ${config.BOT_NAME}\nPowered by Node.js, WhatsApp Web Protocol, and AI.` });

  } else if (command === 'status') {
    // Admin-only command
    const senderNumber = jidToPhone(jid);
    const admins = config.ADMIN_NUMBERS ? config.ADMIN_NUMBERS.split(',').map(normalizePhoneNumber) : [];

    if (admins.includes(senderNumber)) {
      const uptime = Math.floor(process.uptime() / 60);
      const statusMessage = `🤖 BOT STATUS\n\n🟢 WhatsApp: Connected\n🟢 AI Service: Configured\n🟢 Knowledge Base: Loaded\n🟢 Uptime: ${uptime} minutes`;
      await sock.sendMessage(jid, { text: statusMessage });
    } else {
      await sock.sendMessage(jid, { text: 'You are not authorized to use this command.' });
    }
  }
}

module.exports = { isCommand, handleCommand, parseSchedule };
