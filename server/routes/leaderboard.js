const express = require('express');
const router = express.Router();
const ds = require('../dataService');
const config = require('../config');

// Helper to format mm:ss or hh:mm:ss
function formatClock(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// GET /api/leaderboard - Live public status with event timer
router.get('/', async (req, res) => {
  try {
    const teams = await ds.getAllTeams();
    const now = Date.now();

    const clockPausedVal = await ds.getSetting('clockPaused', 'false');
    const isClockPaused = clockPausedVal === 'true';

    const pauseStartedVal = await ds.getSetting('pauseStartedAt', '0');
    const pauseStartedAt = parseInt(pauseStartedVal, 10) || 0;

    const eventStartedVal = await ds.getSetting('eventStartedAt', '0');
    let eventStartedAt = parseInt(eventStartedVal, 10) || 0;

    const totalPausedVal = await ds.getSetting('totalPausedMs', '0');
    let totalPausedMs = parseInt(totalPausedVal, 10) || 0;

    // If eventStartedAt not explicitly set, use earliest active team start time if available
    if (eventStartedAt === 0 && teams.length > 0) {
      const activeTeams = teams.filter(t => t.status !== 'waiting');
      if (activeTeams.length > 0) {
        const minStart = Math.min(...activeTeams.map(t => t.startedAt));
        if (minStart > 0 && minStart !== Infinity) {
          eventStartedAt = minStart;
        }
      }
    }

    // Calculate event timer elapsed
    let eventElapsedSeconds = 0;
    if (eventStartedAt > 0) {
      let effectiveNow = now;
      if (isClockPaused && pauseStartedAt > 0) {
        effectiveNow = pauseStartedAt;
      }
      const elapsedMs = Math.max(0, effectiveNow - eventStartedAt - totalPausedMs);
      eventElapsedSeconds = Math.floor(elapsedMs / 1000);
    }

    const processed = await Promise.all(teams.map(async t => {
      const progress = await ds.getProgress(t.id);
      const totalWrong = progress.reduce((acc, p) => acc + (p.wrongAttempts || 0), 0);
      const totalHints = progress.reduce((acc, p) => acc + (p.hintsUsed || 0), 0);

      let effectiveElapsedMs = 0;
      if (t.finishedAt) {
        effectiveElapsedMs = t.finishedAt - t.startedAt - (t.pausedMs || 0);
      } else if (t.status === 'waiting') {
        effectiveElapsedMs = 0;
      } else {
        effectiveElapsedMs = (isClockPaused && pauseStartedAt > 0 ? pauseStartedAt : now) - t.startedAt - (t.pausedMs || 0);
      }
      if (effectiveElapsedMs < 0) effectiveElapsedMs = 0;

      const totalSeconds = Math.floor(effectiveElapsedMs / 1000) + (t.penaltyMin || 0) * 60;
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      return {
        id: t.id,
        name: t.name,
        coordinator: t.coordinator,
        stageText: t.finishedAt ? '✅ Done' : (t.status === 'waiting' ? 'Lobby' : `${t.stage}/6`),
        stageNumber: t.finishedAt ? 7 : (t.status === 'waiting' ? 0 : t.stage),
        isFinished: !!t.finishedAt,
        isWaiting: t.status === 'waiting',
        isIndividuallyPaused: t.isPaused === 1,
        totalSeconds,
        formattedTime,
        totalHints,
        totalWrong,
        tabSwitches: t.tabSwitches || 0,
        penaltyMin: t.penaltyMin
      };
    }));

    // Sort: Finished teams first, then totalSeconds asc, totalHints asc, totalWrong asc
    processed.sort((a, b) => {
      if (a.isFinished && !b.isFinished) return -1;
      if (!a.isFinished && b.isFinished) return 1;

      if (a.isFinished && b.isFinished) {
        if (a.totalSeconds !== b.totalSeconds) return a.totalSeconds - b.totalSeconds;
        if (a.totalHints !== b.totalHints) return a.totalHints - b.totalHints;
        return a.totalWrong - b.totalWrong;
      }

      if (a.stageNumber !== b.stageNumber) return b.stageNumber - a.stageNumber;
      if (a.totalSeconds !== b.totalSeconds) return a.totalSeconds - b.totalSeconds;
      if (a.totalHints !== b.totalHints) return a.totalHints - b.totalHints;
      return a.totalWrong - b.totalWrong;
    });

    return res.json({
      teams: processed,
      isClockPaused,
      serverTime: now,
      clock: {
        isPaused: isClockPaused,
        isRunning: eventStartedAt > 0 && !isClockPaused,
        eventStartedAt,
        pauseStartedAt,
        totalSeconds: eventElapsedSeconds,
        formattedTime: formatClock(eventElapsedSeconds)
      }
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    return res.status(500).json({ error: 'Server error retrieving leaderboard.' });
  }
});

// POST /api/leaderboard/clock - Start/Stop/Reset timer from leaderboard with PIN
router.post('/clock', async (req, res) => {
  try {
    const pin = req.headers['x-admin-pin'] || req.body.pin;
    if (!pin || pin !== config.ADMIN_PIN) {
      return res.status(401).json({ error: 'Organizer PIN required to control event timer.' });
    }

    const { action } = req.body; // 'start', 'stop', 'pause', 'resume', 'toggle', 'reset'
    const now = Date.now();

    const clockPausedVal = await ds.getSetting('clockPaused', 'false');
    const isPaused = clockPausedVal === 'true';

    const pauseStartedVal = await ds.getSetting('pauseStartedAt', '0');
    const pauseStartedAt = parseInt(pauseStartedVal, 10) || 0;

    const eventStartedVal = await ds.getSetting('eventStartedAt', '0');
    let eventStartedAt = parseInt(eventStartedVal, 10) || 0;

    if (action === 'start') {
      if (eventStartedAt === 0) {
        eventStartedAt = now;
        await ds.setSetting('eventStartedAt', String(now));
      }
      if (isPaused) {
        const duration = pauseStartedAt > 0 ? (now - pauseStartedAt) : 0;
        const allTeams = await ds.getAllTeams();
        for (const t of allTeams) {
          if (!t.finishedAt) {
            await ds.updateTeam(t.id, { pausedMs: (t.pausedMs || 0) + duration });
          }
        }
        const totalPausedVal = await ds.getSetting('totalPausedMs', '0');
        const prevTotal = parseInt(totalPausedVal, 10) || 0;
        await ds.setSetting('totalPausedMs', String(prevTotal + duration));
        await ds.setSetting('clockPaused', 'false');
        await ds.setSetting('pauseStartedAt', '0');
      }
    } else if (action === 'stop' || action === 'pause') {
      if (!isPaused) {
        await ds.setSetting('clockPaused', 'true');
        await ds.setSetting('pauseStartedAt', String(now));
      }
    } else if (action === 'toggle') {
      if (isPaused) {
        // Resume
        const duration = pauseStartedAt > 0 ? (now - pauseStartedAt) : 0;
        const allTeams = await ds.getAllTeams();
        for (const t of allTeams) {
          if (!t.finishedAt) {
            await ds.updateTeam(t.id, { pausedMs: (t.pausedMs || 0) + duration });
          }
        }
        const totalPausedVal = await ds.getSetting('totalPausedMs', '0');
        const prevTotal = parseInt(totalPausedVal, 10) || 0;
        await ds.setSetting('totalPausedMs', String(prevTotal + duration));
        await ds.setSetting('clockPaused', 'false');
        await ds.setSetting('pauseStartedAt', '0');
      } else {
        // Pause
        await ds.setSetting('clockPaused', 'true');
        await ds.setSetting('pauseStartedAt', String(now));
      }
    } else if (action === 'reset') {
      await ds.setSetting('eventStartedAt', String(now));
      await ds.setSetting('totalPausedMs', '0');
      await ds.setSetting('clockPaused', 'false');
      await ds.setSetting('pauseStartedAt', '0');
    }

    const updatedPausedVal = await ds.getSetting('clockPaused', 'false');
    return res.json({
      success: true,
      isPaused: updatedPausedVal === 'true'
    });
  } catch (err) {
    console.error('Clock error:', err);
    return res.status(500).json({ error: 'Failed to update clock.' });
  }
});

module.exports = router;
