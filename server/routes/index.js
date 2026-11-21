const express = require('express');
const router = express.Router();
const config = require('../config');

// Mount modular sub-routers with unchanged public URLs
router.use('/teams', require('./teamsRoutes'));
router.use('/state', require('./stateRoutes'));
router.use('/submit', require('./submissionRoutes'));
router.use('/hint', require('./hintRoutes'));
router.use('/join', require('./joinRoutes'));
router.use('/notes', require('./notesRoutes'));
router.use('/warden', require('./wardenRoutes'));
router.use('/terminal', require('./terminalRoutes'));
router.use('/coordinator', require('./coordinatorRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/leaderboard', require('./leaderboardRoutes'));
router.use('/tab-penalty', require('./tabPenaltyRoutes'));

// Public config endpoint
router.get('/config', (req, res) => {
  res.json({
    coordinators: config.COORDINATORS,
    timeCapMinutes: config.TIME_CAP_MINUTES,
    minTeamSize: config.MIN_TEAM_SIZE,
    maxTeamSize: config.MAX_TEAM_SIZE
  });
});

// Health check endpoint (Phase 3.F)
router.get('/health', (req, res) => {
  res.json({ ok: true, time: Date.now() });
});

module.exports = router;
