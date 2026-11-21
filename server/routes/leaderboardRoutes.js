const express = require('express');
const router = express.Router();
const LeaderboardService = require('../services/leaderboardService');
const AdminService = require('../services/adminService');

const leaderboardService = new LeaderboardService();
const adminService = new AdminService();

// GET /api/leaderboard - Live public standings (cached 2s, projector safe, Phase 6.3)
router.get('/', (req, res) => {
  const isProjector = req.query.projector === 'true';
  const data = leaderboardService.getStandings(isProjector);
  return res.json(data);
});

// POST /api/leaderboard/clock - Admin control of event timer
router.post('/clock', (req, res, next) => {
  try {
    const pin = req.headers['x-admin-pin'] || req.body.pin;
    if (!adminService.verifyPin(pin)) {
      return res.status(401).json({ error: 'Organizer Admin PIN required to control clock.' });
    }

    const { action } = req.body || {};
    const isPaused = action === 'pause' || action === 'stop';
    const result = adminService.toggleGlobalPause(isPaused);

    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
