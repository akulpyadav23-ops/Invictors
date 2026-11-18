const express = require('express');
const router = express.Router();
const ds = require('../dataService');
const { handleWardenChat } = require('../logic/warden');

router.post('/', async (req, res) => {
  try {
    const leaderToken = req.cookies.fo_leader_token;
    if (!leaderToken) {
      return res.status(401).json({ error: 'Unauthorized: Team session required.' });
    }

    const team = await ds.getTeamByToken(leaderToken);
    if (!team) {
      return res.status(401).json({ error: 'Team not found.' });
    }

    if (team.stage !== 3) {
      return res.status(403).json({ error: 'WARDEN AI is only active in Stage 3.' });
    }

    const message = (req.body.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    if (message.length > 600) {
      return res.status(400).json({ error: 'Message exceeds 600 characters limit.' });
    }

    // Rate limiting: max 40 messages per hour per team
    const oneHourAgo = Date.now() - 3600 * 1000;
    const count = await ds.getRecentChatCount(team.id, 'user', oneHourAgo);

    if (count >= 40) {
      return res.status(429).json({ error: 'Message limit reached (max 40 messages per hour).' });
    }

    const now = Date.now();
    // Log user message
    await ds.addChat({
      teamId: team.id,
      role: 'user',
      text: message,
      at: now
    });

    try {
      const reply = await handleWardenChat(message);

      // Log WARDEN reply
      await ds.addChat({
        teamId: team.id,
        role: 'warden',
        text: reply,
        at: Date.now()
      });

      return res.json({ reply });
    } catch (err) {
      console.error('Error handling WARDEN chat:', err);
      return res.status(500).json({ error: 'Internal AI communication failure.' });
    }
  } catch (err) {
    console.error('Warden error:', err);
    return res.status(500).json({ error: 'Server error processing AI communication.' });
  }
});

// GET /api/warden/history
router.get('/history', async (req, res) => {
  try {
    const leaderToken = req.cookies.fo_leader_token;
    if (!leaderToken) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const team = await ds.getTeamByToken(leaderToken);
    if (!team || team.stage !== 3) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const history = await ds.getChatHistory(team.id);
    return res.json({ history });
  } catch (err) {
    console.error('Warden history error:', err);
    return res.status(500).json({ error: 'Failed to retrieve history.' });
  }
});

module.exports = router;
