// Utility functions for the bot
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizePhoneNumber(number) {
  if (typeof number !== 'string' && typeof number !== 'number') return '';
  let value = String(number).trim().replace(/@.*$/, '').replace(/:.*/, '').replace(/[\s()-]/g, '');
  if (value.startsWith('+')) value = value.slice(1);
  if (!/^\d{8,15}$/.test(value) || value.startsWith('0')) return '';
  return value;
}

function jidToPhone(sender) {
  return normalizePhoneNumber(sender || '');
}

function toWhatsAppJid(number) {
  const normalized = normalizePhoneNumber(number);
  return normalized ? `${normalized}@s.whatsapp.net` : '';
}

function isOwner(sender, ownerNumber) {
  return jidToPhone(sender) === normalizePhoneNumber(ownerNumber);
}

module.exports = {
  sleep,
  normalizePhoneNumber,
  jidToPhone,
  toWhatsAppJid,
  isOwner
};
