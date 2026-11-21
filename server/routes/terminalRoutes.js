const express = require('express');
const router = express.Router();
const { requireLeader } = require('../middleware/auth');
const terminalService = require('../services/terminalService');

// POST /api/terminal - Execute virtual CTF commands (Phase 4.5)
router.post('/', requireLeader, (req, res) => {
  const team = req.team;
  if (team.stage !== 4) {
    return res.status(403).json({ error: 'CTF terminal node is only accessible during Stage 4.' });
  }

  const rawCmd = req.body.cmd || '';
  const output = terminalService.execute(rawCmd, team);

  return res.json({ output });
});

module.exports = router;
