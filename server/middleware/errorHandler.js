const crypto = require('crypto');
const logger = require('../lib/logger');

function errorHandler(err, req, res, _next) {
  const requestId = crypto.randomUUID();
  const status = err.status || 500;
  const message = err.message || 'Internal mission server error.';

  logger.error(message, {
    requestId,
    status,
    url: req.originalUrl,
    method: req.method,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  });

  res.status(status).json({
    error: message,
    requestId,
    ...(process.env.NODE_ENV === 'development' ? { details: err.stack } : {})
  });
}

module.exports = errorHandler;
