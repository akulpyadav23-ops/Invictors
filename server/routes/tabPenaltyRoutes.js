const express = require('express');
const router = express.Router();
const { requireLeader } = require('../middleware/auth');
const antiCheatService = require('../services/antiCheatService');

// POST /api/tab-penalty - Log tab switch / visibility change (Phase 4.7)
router.post('/', requireLeader, (req, res) => {
  const team = req.team;
  const stage = team.stage;

  const result = antiCheatService.recordVisibilityChange(team, stage);
  return res.json(result);
});

module.exports = router;
