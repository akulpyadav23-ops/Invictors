const dotenv = require('dotenv');
const path = require('path');
const { validateEnv } = require('./schema');

// Load .env
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

let config = null;

try {
  config = validateEnv(process.env);
} catch (err) {
  if (process.env.NODE_ENV !== 'test') {
    console.error(err.message);
    process.exit(1);
  } else {
    // In test environment, fallback with test defaults
    process.env.ADMIN_PIN = process.env.ADMIN_PIN || 'TEST_PIN_12345';
    process.env.EVENT_SALT = process.env.EVENT_SALT || 'test_salt_at_least_16_chars_long';
    process.env.SHARD_SECRET = process.env.SHARD_SECRET || 'test_shard_secret_16_chars';
    config = validateEnv(process.env);
  }
}

// Constant-time coordinator PIN check
config.verifyCoordinatorPin = function verifyCoordinatorPin(name, pin) {
  if (!name || !pin) return false;
  const expected = config.COORDINATOR_PINS[name.trim().toLowerCase()];
  if (!expected) return false;

  const a = Buffer.from(String(pin).trim());
  const b = Buffer.from(String(expected).trim());
  if (a.length !== b.length) return false;
  const crypto = require('crypto');
  return crypto.timingSafeEqual(a, b);
};

module.exports = config;
