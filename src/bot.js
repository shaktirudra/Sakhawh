const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const config = require('./config');
const logger = require('./logger');
const { normalizePhoneNumber, sleep } = require('./utils');
const { handleMessage } = require('./messageHandler');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const qrcode = require('qrcode-terminal');

let isStarting = false;
let pairingRequested = false;
let versionRetryAttempted = false;

async function startBot() {
  if (isStarting) {
    logger.info('startBot called but bot is already starting/started.');
    return;
  }
  isStarting = true;

  try {
    logger.info('Loading WhatsApp authentication state...');
    const { state, saveCreds } = await useMultiFileAuthState('auth');

    const pinoLevel = 'debug';
    // Try to fetch the latest WA Web version to improve compatibility
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: pinoLevel }),
      browser: ['SakhaAI', 'Desktop', '1.0.0'],
      generateHighQualityLinkPreview: true,
      connectTimeoutMs: 30_000
    });

    // If not registered, we will wait for connection.update events.
    // Baileys may emit a pairing code or a QR in connection.update. We'll handle both safely there.
    if (!state?.creds?.registered) {
      let phoneNumber = normalizePhoneNumber(config.PHONE_NUMBER);
      if (!phoneNumber) {
        logger.error('PHONE_NUMBER is not set or invalid in environment variables.');
        process.exit(1);
      }
      logger.info('Waiting for pairing information (pairing code or QR) from WhatsApp...');
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, pairing } = update;
      // Always print the raw update to console for troubleshooting
      try {
        console.log('connection.update:', JSON.stringify(update, null, 2));
      } catch (e) {
        console.log('connection.update: (unserializable update)');
      }
      logger.debug(`connection.update: ${JSON.stringify(update)}`);

      // If library provides a QR string, show pairing instructions (fallback)
      if (qr) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`       ${config.BOT_NAME.toUpperCase()}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('WhatsApp pairing required.\n');
        console.log(`Number: +${normalizePhoneNumber(config.PHONE_NUMBER)}\n`);
        console.log('Open WhatsApp:');
        console.log('Settings → Linked Devices → Link a Device\n');
        console.log('PAIRING (QR) DATA (scan with WhatsApp):');
        console.log(qr);
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Generate and display QR code in terminal
        qrcode.generate(qr, { small: true });

        // Save raw QR string and generate PNG for scanning via camera
        try {
          const authDir = path.join(process.cwd(), 'auth');
          if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
          const txtPath = path.join(authDir, 'latest_qr.txt');
          const pngPath = path.join(authDir, 'qr.png');
          fs.writeFileSync(txtPath, qr, { encoding: 'utf-8' });
          // Generate PNG file (overwrite)
          QRCode.toFile(pngPath, qr, { type: 'png', margin: 2 }, (err) => {
            if (err) {
              logger.error(`Failed to write QR PNG: ${err?.message || err}`);
            } else {
              logger.info(`Saved QR PNG to ${pngPath}`);
            }
          });
        } catch (e) {
          logger.error(`Failed to save QR data: ${e?.message || e}`);
        }
      }

      // If library provides a structured pairing object with code (8-char), show it
      if (pairing && pairing.code) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`       ${config.BOT_NAME.toUpperCase()}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('WhatsApp pairing required.\n');
        console.log(`Number: +${normalizePhoneNumber(config.PHONE_NUMBER)}\n`);
        console.log('Open WhatsApp:');
        console.log('Settings → Linked Devices → Link a Device\n');
        console.log(`PAIRING CODE: ${pairing.code}`);
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      }

      // If no pairing.code provided, the library should handle it.
      
      if (connection === 'close') {
        const err = lastDisconnect?.error;
        let reason = 'Unknown';
        try {
          const boom = new Boom(err);
          reason = boom.message || reason;
        } catch (_) {
          reason = String(err || reason);
        }

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        logger.warn(`WhatsApp disconnected. Reason: ${reason}. Reconnect: ${shouldReconnect}`);

        if (shouldReconnect) {
          await sleep(3000);
          isStarting = false;
          startBot();
        } else {
          logger.error('WhatsApp logged out. The session is invalid. Delete the "auth" folder and restart to pair again.');

          // Optional auto reset behavior: when enabled, rename the auth folder so a fresh pairing can occur.
          // This is disabled by default; enable by setting AUTO_RESET_AUTH=true in .env
          try {
            const shouldAuto = process.env.AUTO_RESET_AUTH === 'true' || config.AUTO_RESET_AUTH === 'true';
            const authDir = path.join(process.cwd(), 'auth');
            if (shouldAuto && fs.existsSync(authDir)) {
              const backup = path.join(process.cwd(), `auth.invalid.${Date.now()}`);
              fs.renameSync(authDir, backup);
              logger.warn(`Auth folder renamed to ${backup} to allow fresh pairing. Restart the bot to begin pairing.`);
            }
          } catch (e) {
            logger.error(`Failed to auto-reset auth folder: ${e?.message || e}`);
          }
        }
      } else if (connection === 'connecting') {
        logger.info('Connecting to WhatsApp...');
      } else if (connection === 'open') {
        logger.info('WhatsApp connected successfully.');
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue; // Prevent responding to self
        await handleMessage(sock, msg);
      }
    });

  } catch (error) {
    logger.error(`WhatsAppError: Failed to start bot - ${error?.message || error}`);
    isStarting = false;
  }
}

module.exports = { startBot };
