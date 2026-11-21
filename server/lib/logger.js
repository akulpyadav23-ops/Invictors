// Structured JSON logger with route, duration, teamId, status

const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const currentLevelName = process.env.LOG_LEVEL || 'info';
const currentLevel = LOG_LEVELS[currentLevelName] || 20;

function formatLog(level, msg, meta = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    time: timestamp,
    level,
    msg,
    ...meta
  };
  return JSON.stringify(entry);
}

const logger = {
  debug(msg, meta) {
    if (currentLevel <= 10) console.log(formatLog('debug', msg, meta));
  },
  info(msg, meta) {
    if (currentLevel <= 20) console.log(formatLog('info', msg, meta));
  },
  warn(msg, meta) {
    if (currentLevel <= 30) console.warn(formatLog('warn', msg, meta));
  },
  error(msg, meta) {
    if (currentLevel <= 40) console.error(formatLog('error', msg, meta));
  }
};

module.exports = logger;
