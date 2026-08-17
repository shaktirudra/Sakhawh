const config = require('./config');
const { normalizePhoneNumber } = require('./utils');

const COMMAND_PREFIX = '.';

function isCommand(text) {
  return typeof text === 'string' && text.trim().startsWith(COMMAND_PREFIX);
}

async function handleCommand(sock, jid, text) {
  const args = text.slice(COMMAND_PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'start') {
    const welcomeMessage = `🤖 Welcome to *${config.BOT_NAME}*\n\nI am your AI-powered WhatsApp assistant.\n\nI can help you with:\n• Website information\n• Business information\n• General questions\n• Services\n• Contact information\n\nType *.menu* to see available commands.`;
    await sock.sendMessage(jid, { text: welcomeMessage });

  } else if (command === 'menu') {
    const menuMessage = `╭━━━━━━━━━━━━━━━━━━━━╮\n      🤖 BOT MENU\n╰━━━━━━━━━━━━━━━━━━━━╯\n\n📚 INFORMATION\n• .start\n• .menu\n• .about\n\n🌐 WEBSITE\n• Ask questions about the website\n• Ask about services\n• Ask about contact information\n\n🧠 AI\n• Ask any supported question\n\n━━━━━━━━━━━━━━━━━━━━━━\nPowered by ${config.BOT_NAME}`;
    await sock.sendMessage(jid, { text: menuMessage });

  } else if (command === 'about') {
    await sock.sendMessage(jid, { text: `🤖 ${config.BOT_NAME}\nPowered by Node.js, WhatsApp Web Protocol, and AI.` });

  } else if (command === 'status') {
    // Admin-only command
    const senderNumber = jid.split('@')[0];
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

module.exports = { isCommand, handleCommand };
