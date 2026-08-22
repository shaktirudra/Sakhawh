const config = require('./config');
const logger = require('./logger');
const { getCollection } = require('./database');
const { toWhatsAppJid } = require('./utils');

let interval = null;
let currentSocket = null;
let connected = false;
let lastRecoveryAt = 0;
const MAX_ATTEMPTS = 5;
const STALE_PROCESSING_MS = 5 * 60 * 1000;

async function recoverStaleJobs() {
  const collection = getCollection('scheduled_messages');
  if (!collection) return;
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS);
  const result = await collection.updateMany(
    { status: 'processing', processingStartedAt: { $lte: cutoff } },
    { $set: { status: 'pending', lastError: 'Recovered after stale processing lease' }, $unset: { processingStartedAt: '' } }
  );
  if (result.modifiedCount) logger.warn(`Recovered ${result.modifiedCount} stale scheduled message(s).`);
}

async function processDueMessages(sock) {
  const collection = getCollection('scheduled_messages');
  if (!collection || !connected || !sock?.user) return;
  if (Date.now() - lastRecoveryAt >= 60 * 1000) {
    await recoverStaleJobs();
    lastRecoveryAt = Date.now();
  }

  while (true) {
    const job = await collection.findOneAndUpdate(
      { status: 'pending', scheduledAt: { $lte: new Date() } },
      { $set: { status: 'processing', processingStartedAt: new Date() }, $inc: { attempts: 1 } },
      { sort: { scheduledAt: 1 }, returnDocument: 'after' }
    );
    if (!job) return;

    try {
      const recipientJid = job.recipientJid || toWhatsAppJid(job.recipient);
      if (!recipientJid) throw new Error('Scheduled recipient is invalid');
      const sentMessage = await sock.sendMessage(recipientJid, { text: job.message });
      const sent = await collection.updateOne(
        { _id: job._id, status: 'processing' },
        { $set: { status: 'sent', sentAt: new Date() }, $unset: { processingStartedAt: '', lastError: '' } }
      );
      logger.info(`[SCHEDULER] Message sent successfully\nJob ID: ${job._id}\nRecipient: ${recipientJid}\nMessage ID: ${sentMessage?.key?.id || 'unknown'}`);
      if (!sent.modifiedCount) logger.warn(`Scheduled message status changed before sent update: ${job._id}`);
    } catch (error) {
      const attempts = Number(job.attempts || 1);
      const retry = attempts < MAX_ATTEMPTS;
      await collection.updateOne(
        { _id: job._id, status: 'processing' },
        retry
          ? { $set: { status: 'pending', lastError: error?.message || String(error) }, $unset: { processingStartedAt: '' } }
          : { $set: { status: 'failed', failedAt: new Date(), lastError: error?.message || String(error) }, $unset: { processingStartedAt: '' } }
      );
      logger.error(`Scheduled message ${retry ? 'will retry' : 'failed'}: ${job._id} - ${error?.message || error}`);
    }
  }
}

async function startScheduler(sock) {
  currentSocket = sock;
  await recoverStaleJobs().catch(error => logger.error(`Scheduler recovery error: ${error?.message || error}`));
  if (interval) return;
  const run = () => processDueMessages(currentSocket).catch(error => logger.error(`Scheduler error: ${error?.message || error}`));
  run();
  interval = setInterval(run, Math.min(5000, Math.max(1000, config.SCHEDULER_INTERVAL_MS)));
}

function setSchedulerConnection(isConnected, sock) {
  connected = isConnected;
  if (sock) currentSocket = sock;
}

function stopScheduler() {
  if (interval) clearInterval(interval);
  interval = null;
  currentSocket = null;
  connected = false;
}

module.exports = { startScheduler, stopScheduler, processDueMessages, setSchedulerConnection, recoverStaleJobs };
