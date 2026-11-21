// Vercel serverless entry point: re-exports the Express app
const app = require('../server/app');

module.exports = app;
