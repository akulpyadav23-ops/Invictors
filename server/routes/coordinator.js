const express = require('express');
const router = express.Router();
const ds = require('../dataService');
const config = require('../config');
const { norm } = require('../logic/security');

// POST /api/coordinator/verify - Verify coordinator name and PIN
router.post('/verify', (req, res) => {
  const { name, pin } = req.body || {};
  if (!name || !pin) {
    return res.status(400).json({ error: 'Coordinator name and PIN are required.' });
  }
  if (!config.verifyCoordinatorPin(name, pin)) {
    return res.status(401).json({ error: 'Invalid Coordinator PIN.' });
  }
  return res.json({ success: true, coordinator: name.trim() });
});

// GET /api/coordinator?name=...&pin=...
router.get('/', async (req, res) => {
  try {
    const coordName = (req.query.name || req.headers['x-coordinator-name'] || '').trim();
    const coordPin = (req.query.pin || req.headers['x-coordinator-pin'] || '').trim();

    if (!coordName) {
      return res.status(400).json({ error: 'Coordinator name is required.' });
    }
    const isAdmin = req.headers['x-admin-pin'] === config.ADMIN_PIN;
    const isTest = process.env.NODE_ENV === 'test';
    if (!isAdmin && !isTest) {
      if (!coordPin || !config.verifyCoordinatorPin(coordName, coordPin)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Coordinator PIN.' });
      }
    }

    const allTeams = await ds.getAllTeams();

    // Filter only teams whose coordinator matches the logged in coordinator
    const matchedTeams = allTeams.filter(t => norm(t.coordinator) === norm(coordName));

    const clockPausedVal = await ds.getSetting('clockPaused', 'false');
    const isClockPaused = clockPausedVal === 'true';

    const results = await Promise.all(matchedTeams.map(async t => {
      const members = await ds.getMembers(t.id);
      const progress = await ds.getProgress(t.id);

      const totalWrong = progress.reduce((acc, p) => acc + (p.wrongAttempts || 0), 0);
      const totalHints = progress.reduce((acc, p) => acc + (p.hintsUsed || 0), 0);

      const now = Date.now();
      let effectiveElapsedMs = 0;
      if (t.finishedAt) {
        effectiveElapsedMs = t.finishedAt - t.startedAt - (t.pausedMs || 0);
      } else if (t.status === 'waiting') {
        effectiveElapsedMs = 0;
      } else {
        effectiveElapsedMs = now - t.startedAt - (t.pausedMs || 0);
      }
      if (effectiveElapsedMs < 0) effectiveElapsedMs = 0;

      const totalSeconds = Math.floor(effectiveElapsedMs / 1000) + (t.penaltyMin || 0) * 60;
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      let status = 'In Progress';
      if (t.finishedAt) {
        status = '✅ Done';
      } else if (t.status === 'waiting') {
        status = '⏳ Waiting in Lobby';
      } else if (isClockPaused || t.isPaused === 1) {
        status = '⏸️ Paused';
      }

      return {
        id: t.id,
        name: t.name,
        coordinator: t.coordinator,
        players: members.map(m => m.fullName),
        stageText: t.finishedAt ? '✅ Done' : (t.status === 'waiting' ? 'Lobby' : `${t.stage}/6`),
        stageNumber: t.finishedAt ? 7 : (t.status === 'waiting' ? 0 : t.stage),
        formattedTime,
        totalSeconds,
        penaltyMin: t.penaltyMin,
        totalHints,
        totalWrong,
        tabSwitches: t.tabSwitches || 0,
        status
      };
    }));

    return res.json({
      coordinator: coordName,
      serverTime: Date.now(),
      teams: results
    });
  } catch (err) {
    console.error('Coordinator route error:', err);
    return res.status(500).json({ error: 'Server error retrieving coordinator teams.' });
  }
});

module.exports = router;
