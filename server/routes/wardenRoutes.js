const express = require('express');
const router = express.Router();
const { requireLeader } = require('../middleware/auth');
const { getRepositories } = require('../repositories');
const { handleWardenChat } = require('../services/wardenEngine');
const rateLimiter = require('../lib/rateLimiter');
const clock = require('../lib/clock');

const repos = getRepositories();

// POST /api/warden or /api/warden/chat - Chat with WARDEN AI Guardian (Phase 4.4)
const handleWardenMessage = async (req, res, next) => {
  try {
    const team = req.team;

    if (team.stage !== 3) {
      return res.status(403).json({ error: 'WARDEN AI guardian is only active during Stage 3.' });
    }

    const message = (req.body.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    if (message.length > 600) {
      return res.status(400).json({ error: 'Message exceeds the 600 character transmission ceiling.' });
    }

    // Rate limiting: 40 messages per hour per team
    const rateCheck = rateLimiter.consume(`warden:${team.id}`, 40, 3600000);
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
      return res.status(429).json({ error: 'Transmission bandwidth ceiling reached (max 40 messages per hour).' });
    }

    const now = clock.now();
    repos.chat.add({
      teamId: team.id,
      role: 'user',
      text: message,
      at: now
    });

    const reply = await handleWardenChat(message);

    repos.chat.add({
      teamId: team.id,
      role: 'warden',
      text: reply,
      at: clock.now()
    });

    return res.json({
      success: true,
      reply,
      response: reply
    });
  } catch (err) {
    next(err);
  }
};

router.post('/', requireLeader, handleWardenMessage);
router.post('/chat', requireLeader, handleWardenMessage);

// GET /api/warden/history
router.get('/history', requireLeader, (req, res) => {
  const history = repos.chat.getHistory(req.team.id);
  res.json({ history });
});

module.exports = router;
