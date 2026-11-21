const crypto = require('crypto');

function validateEnv(rawEnv = process.env) {
  const errors = [];

  const NODE_ENV = rawEnv.NODE_ENV || 'development';
  const isTest = NODE_ENV === 'test';

  // 1. ADMIN_PIN
  const ADMIN_PIN = rawEnv.ADMIN_PIN;
  if (!ADMIN_PIN) {
    errors.push('ADMIN_PIN is required');
  } else if (ADMIN_PIN.length < 8) {
    errors.push('ADMIN_PIN must be at least 8 characters long');
  } else if (ADMIN_PIN.toUpperCase() === 'INVICTORS' || ADMIN_PIN.toUpperCase() === 'INVICTORS@23') {
    if (!isTest) {
      errors.push('ADMIN_PIN cannot use default values ("INVICTORS" or "INVICTORS@23")');
    }
  }

  // 2. EVENT_SALT
  const EVENT_SALT = rawEnv.EVENT_SALT;
  const legacySalts = ['invictors_final_override_salt_2026', 'final_override_secret_salt_2026'];
  if (!EVENT_SALT) {
    errors.push('EVENT_SALT is required');
  } else if (EVENT_SALT.length < 16) {
    errors.push('EVENT_SALT must be at least 16 characters long');
  } else if (legacySalts.includes(EVENT_SALT) && !isTest) {
    errors.push('EVENT_SALT cannot use old default salt values');
  }

  // 3. SHARD_SECRET
  const SHARD_SECRET = rawEnv.SHARD_SECRET;
  if (!SHARD_SECRET) {
    errors.push('SHARD_SECRET is required');
  } else if (SHARD_SECRET.length < 16) {
    errors.push('SHARD_SECRET must be at least 16 characters long');
  }

  // 4. VERIFY_SECRET
  let VERIFY_SECRET = rawEnv.VERIFY_SECRET;
  if (!VERIFY_SECRET && SHARD_SECRET) {
    VERIFY_SECRET = crypto.createHmac('sha256', SHARD_SECRET).update('derived_verify_secret').digest('hex');
  } else if (VERIFY_SECRET && VERIFY_SECRET.length < 16) {
    errors.push('VERIFY_SECRET must be at least 16 characters long');
  }

  // 5. COORDINATORS and COORDINATOR_PINS
  const rawCoords = rawEnv.COORDINATORS || 'Arun,Divya,Kiran,Pooja,Rakshith';
  const coordinators = rawCoords.split(',').map(c => c.trim()).filter(Boolean);

  const rawPins = rawEnv.COORDINATOR_PINS || '';
  const coordinatorPins = {};

  if (rawPins) {
    // Format: "Name1:Pin1,Name2:Pin2" or comma-separated pins matching coordinators array
    const parts = rawPins.split(',').map(p => p.trim()).filter(Boolean);
    if (parts[0] && parts[0].includes(':')) {
      for (const pair of parts) {
        const [name, pin] = pair.split(':').map(s => s.trim());
        if (name && pin) {
          if (pin.length < 6 && !isTest) {
            errors.push(`Coordinator PIN for "${name}" must be at least 6 characters long`);
          }
          coordinatorPins[name.toLowerCase()] = pin;
        }
      }
      for (const c of coordinators) {
        if (!coordinatorPins[c.toLowerCase()]) {
          errors.push(`Missing coordinator PIN for "${c}"`);
        }
      }
    } else {
      if (parts.length !== coordinators.length && !isTest) {
        errors.push(`COORDINATOR_PINS count (${parts.length}) must match COORDINATORS count (${coordinators.length})`);
      }
      coordinators.forEach((c, idx) => {
        const pin = parts[idx];
        if (pin) {
          if (pin.length < 6 && !isTest) {
            errors.push(`Coordinator PIN for "${c}" must be at least 6 characters long`);
          }
          coordinatorPins[c.toLowerCase()] = pin;
        }
      });
    }
  } else {
    // Default coordinator PINs generated for dev/test if not provided
    if (!isTest) {
      errors.push('COORDINATOR_PINS is required and each PIN must be at least 6 characters long');
    } else {
      coordinators.forEach(c => {
        coordinatorPins[c.toLowerCase()] = 'pin_123456';
      });
    }
  }

  // 6. Numbers & Flags
  const MIN_TEAM_SIZE = parseInt(rawEnv.MIN_TEAM_SIZE, 10) || 3;
  const MAX_TEAM_SIZE = parseInt(rawEnv.MAX_TEAM_SIZE, 10) || 4;
  if (MIN_TEAM_SIZE < 1 || MAX_TEAM_SIZE < MIN_TEAM_SIZE) {
    errors.push('MIN_TEAM_SIZE and MAX_TEAM_SIZE must be valid numbers (min <= max)');
  }

  const TIME_CAP_MINUTES = parseInt(rawEnv.TIME_CAP_MINUTES, 10) || 90;
  const TIME_CAP_ENFORCED = rawEnv.TIME_CAP_ENFORCED !== 'false';
  const TAB_PENALTY_ENABLED = rawEnv.TAB_PENALTY_ENABLED !== 'false';
  const TAB_PENALTY_MINUTES = parseInt(rawEnv.TAB_PENALTY_MINUTES, 10) || 1;

  const WARDEN_MODE = rawEnv.WARDEN_MODE === 'llm' ? 'llm' : 'rules';
  const OPENAI_API_KEY = rawEnv.OPENAI_API_KEY || '';

  const DB_PROVIDER = rawEnv.DB_PROVIDER || 'sqlite';
  if (!['sqlite', 'supabase', 'firebase'].includes(DB_PROVIDER)) {
    errors.push('DB_PROVIDER must be one of: sqlite, supabase, firebase');
  }

  const DB_PATH = rawEnv.DB_PATH || './data/final_override.db';
  const PORT = parseInt(rawEnv.PORT, 10) || 3000;
  const HOST = rawEnv.HOST || '0.0.0.0';
  const TRUST_PROXY = rawEnv.TRUST_PROXY === 'true';
  const ADMIN_SESSION_LIMIT = parseInt(rawEnv.ADMIN_SESSION_LIMIT, 10) || 2;
  const ALLOW_NEW_TEAMS = rawEnv.ALLOW_NEW_TEAMS === 'true';
  const CLUSTER_WORKERS = parseInt(rawEnv.CLUSTER_WORKERS, 10) || 1;
  const LOG_LEVEL = rawEnv.LOG_LEVEL || 'info';

  if (errors.length > 0) {
    const errorMsg = [
      '======================================================',
      '❌ FATAL CONFIGURATION ERROR: Invalid environment configuration:',
      ...errors.map(e => `  - ${e}`),
      '======================================================'
    ].join('\n');
    const err = new Error(errorMsg);
    err.validationErrors = errors;
    throw err;
  }

  return {
    ADMIN_PIN,
    EVENT_SALT,
    SHARD_SECRET,
    VERIFY_SECRET,
    COORDINATORS: coordinators,
    COORDINATOR_PINS: coordinatorPins,
    MIN_TEAM_SIZE,
    MAX_TEAM_SIZE,
    TIME_CAP_MINUTES,
    TIME_CAP_ENFORCED,
    TAB_PENALTY_ENABLED,
    TAB_PENALTY_MINUTES,
    WARDEN_MODE,
    OPENAI_API_KEY,
    DB_PROVIDER,
    DB_PATH,
    PORT,
    HOST,
    NODE_ENV,
    TRUST_PROXY,
    ADMIN_SESSION_LIMIT,
    ALLOW_NEW_TEAMS,
    CLUSTER_WORKERS,
    LOG_LEVEL
  };
}

module.exports = {
  validateEnv
};
