// Utility functions for the bot
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizePhoneNumber(number) {
  if (!number) return '';
  return number.replace(/[^0-9]/g, '');
}

module.exports = {
  sleep,
  normalizePhoneNumber
};
