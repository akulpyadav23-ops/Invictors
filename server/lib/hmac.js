const crypto = require('crypto');
const config = require('../config');

// Case and whitespace normalizer
function norm(s) {
  if (s === null || s === undefined) return '';
  return String(s).trim().replace(/\s+/g, '').toUpperCase();
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hashAnswer(answer, salt = config.EVENT_SALT) {
  return sha256(`${salt}|${norm(answer)}`);
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 8 uppercase characters from HMAC-SHA256 (A13 / 4.1)
function generateVerificationCode(teamName, startedAtMs, finishedAtMs, secret = config.VERIFY_SECRET) {
  const payload = `${norm(teamName)}|${startedAtMs}|${finishedAtMs}`;
  const hmac = crypto.createHmac('sha256', secret || 'fallback_verify_secret_2026').update(payload).digest('hex');
  return hmac.slice(0, 8).toUpperCase();
}

// HMAC shard generation according to format (A10)
// format: 'mixed' (alphanumeric, e.g. 7K2, 9F3) or 'alpha' (alphabetic only, e.g. EFD, BXA)
function deriveMemberShard(teamName, memberName, format = 'mixed', secret = config.SHARD_SECRET) {
  const payload = `FO_SHARD|${norm(teamName)}|${norm(memberName)}`;
  const hash = crypto.createHmac('sha256', secret || 'fallback_shard_secret_2026').update(payload).digest('hex').toUpperCase();

  if (format === 'alpha') {
    // Filter only letters A-Z
    const letters = hash.replace(/[^A-Z]/g, '');
    return (letters + 'ABC').slice(0, 3);
  } else {
    // Mixed alphanumeric: ensure at least 1 letter and 1 digit
    const chunk = hash.slice(0, 3);
    const hasDigit = /[0-9]/.test(chunk);
    const hasAlpha = /[A-Z]/.test(chunk);
    if (hasDigit && hasAlpha) {
      return chunk;
    }
    // Synthesize 1 digit + 2 letters or 2 digits + 1 letter
    const digits = hash.replace(/[^0-9]/g, '');
    const letters = hash.replace(/[^A-Z]/g, '');
    const d = digits[0] || '7';
    const l1 = letters[0] || 'K';
    const l2 = letters[1] || 'M';
    return `${d}${l1}${l2}`;
  }
}

module.exports = {
  norm,
  sha256,
  hashAnswer,
  generateToken,
  generateVerificationCode,
  deriveMemberShard
};
