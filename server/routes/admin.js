const express = require('express');
const router = express.Router();
const ds = require('../dataService');
const config = require('../config');
const { generateVerificationCode } = require('../logic/security');
const { computeTeamCode, getMemberShard } = require('../logic/shard');
const { computeFinalKey } = require('../logic/finalKey');
const { STAGE_CONFIG } = require('../logic/stages');

// ── Concurrent Admin Session Tracking ────────────────────────────────────────
// Maps sessionId → { lastSeen: timestamp }
const adminSessions = new Map();
const ADMIN_HEARTBEAT_TTL = 30000; // 30s — session expires if no heartbeat

function pruneExpiredAdminSessions() {
  const cutoff = Date.now() - ADMIN_HEARTBEAT_TTL;
  for (const [id, s] of adminSessions) {
    if (s.lastSeen < cutoff) adminSessions.delete(id);
  }
}

function activeAdminCount() {
  pruneExpiredAdminSessions();
  return adminSessions.size;
}

// Admin PIN middleware
function requireAdmin(req, res, next) {
  const pin = req.headers['x-admin-pin'] || req.query.pin || req.body.pin;
  if (!pin || pin !== config.ADMIN_PIN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin PIN.' });
  }
  next();
}

// POST /api/admin/verify - Verify admin pin + enforce concurrent session limit
router.post('/verify', (req, res) => {
  const pin = req.body.pin;
  const sessionId = req.body.sessionId || null;
  if (pin !== config.ADMIN_PIN) {
    return res.status(401).json({ error: 'Invalid Admin PIN.' });
  }
  pruneExpiredAdminSessions();
  // If this sessionId is already counted, allow (re-verify / page refresh)
  if (sessionId && adminSessions.has(sessionId)) {
    adminSessions.get(sessionId).lastSeen = Date.now();
    return res.json({ success: true, sessionId });
  }
  const limit = config.ADMIN_SESSION_LIMIT || 2;
  if (adminSessions.size >= limit) {
    return res.status(429).json({ error: `Admin portal is already open in ${limit} browser sessions. Please close one to continue.` });
  }
  const newId = sessionId || Math.random().toString(36).slice(2) + Date.now();
  adminSessions.set(newId, { lastSeen: Date.now() });
  return res.json({ success: true, sessionId: newId });
});

// POST /api/admin/heartbeat - Keep admin session alive (called every 20s)
router.post('/heartbeat', requireAdmin, (req, res) => {
  const sessionId = req.body.sessionId;
  if (sessionId && adminSessions.has(sessionId)) {
    adminSessions.get(sessionId).lastSeen = Date.now();
  }
  return res.json({ ok: true, activeSessions: activeAdminCount() });
});

// POST /api/admin/logout-session - Explicitly release admin session slot
router.post('/logout-session', (req, res) => {
  const sessionId = req.body.sessionId;
  if (sessionId) adminSessions.delete(sessionId);
  return res.json({ ok: true });
});

// GET /api/admin/teams - List all teams with stats, clock, and settings
router.get('/teams', requireAdmin, async (req, res) => {
  try {
    const teams = await ds.getAllTeams();
    const settings = await ds.getAllSettings();

    const isClockPaused = settings.clockPaused === 'true';
    const isGameStarted = settings.gameStarted === 'true';
    const startTogetherMode = settings.startTogetherMode !== 'false';
    const notepad = settings.winnersNotepad || '';
    const allowNewTeams = settings.allowNewTeams === 'true';

    const now = Date.now();
    const teamIds = teams.map(t => t.id);

    // Optimized batch queries for 100+ teams
    const allMembers = await ds.getMembersForTeams(teamIds);
    const allProgress = await ds.getProgressForTeams(teamIds);

    const membersByTeam = {};
    allMembers.forEach(m => {
      if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = [];
      membersByTeam[m.teamId].push(m);
    });

    const progressByTeam = {};
    allProgress.forEach(p => {
      if (!progressByTeam[p.teamId]) progressByTeam[p.teamId] = [];
      progressByTeam[p.teamId].push(p);
    });

    const fullTeams = teams.map(t => {
      const members = membersByTeam[t.id] || [];
      const progress = progressByTeam[t.id] || [];

      const totalWrong = progress.reduce((acc, p) => acc + (p.wrongAttempts || 0), 0);
      const totalHints = progress.reduce((acc, p) => acc + (p.hintsUsed || 0), 0);

      let effectiveElapsedMs = 0;
      if (t.finishedAt) {
        effectiveElapsedMs = t.finishedAt - t.startedAt - (t.pausedMs || 0);
      } else {
        effectiveElapsedMs = now - t.startedAt - (t.pausedMs || 0);
      }
      if (effectiveElapsedMs < 0) effectiveElapsedMs = 0;

      const totalSeconds = Math.floor(effectiveElapsedMs / 1000) + (t.penaltyMin || 0) * 60;
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      let verificationCode = null;
      if (t.finishedAt) {
        verificationCode = generateVerificationCode(t.name, t.startedAt, t.finishedAt);
      }

      return {
        ...t,
        members,
        progress,
        totalHints,
        totalWrong,
        totalSeconds,
        formattedTime,
        verificationCode,
        isFinished: !!t.finishedAt,
        isIndividuallyPaused: t.isPaused === 1,
        tabSwitches: t.tabSwitches || 0,
        status: t.status || 'active'
      };
    });

    return res.json({
      teams: fullTeams,
      isClockPaused,
      isGameStarted,
      startTogetherMode,
      notepad,
      allowNewTeams,
      serverTime: now
    });
  } catch (err) {
    console.error('Admin teams API error:', err);
    return res.status(500).json({ error: 'Failed to retrieve teams.' });
  }
});

// POST /api/admin/start-all - Launch game simultaneously for all teams
router.post('/start-all', requireAdmin, async (req, res) => {
  try {
    const now = Date.now();
    const activatedCount = await ds.startAllTeams(now);

    return res.json({
      success: true,
      startedAt: now,
      activatedTeamsCount: activatedCount
    });
  } catch (err) {
    console.error('Admin start-all error:', err);
    return res.status(500).json({ error: 'Failed to start game.' });
  }
});

// POST /api/admin/team-pause - Pause or resume an individual team
router.post('/team-pause', requireAdmin, async (req, res) => {
  try {
    const { teamId, action } = req.body; // 'pause' or 'resume'
    const team = await ds.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const now = Date.now();

    if (action === 'pause') {
      await ds.updateTeam(teamId, { isPaused: 1, teamPauseStartedAt: now });
      return res.json({ success: true, isPaused: true });
    } else if (action === 'resume') {
      const pauseStarted = team.teamPauseStartedAt || now;
      const duration = now - pauseStarted;
      const newPausedMs = (team.pausedMs || 0) + (duration > 0 ? duration : 0);

      await ds.updateTeam(teamId, {
        isPaused: 0,
        teamPauseStartedAt: 0,
        pausedMs: newPausedMs
      });
      return res.json({ success: true, isPaused: false });
    }

    return res.json({ success: true, isPaused: team.isPaused === 1 });
  } catch (err) {
    console.error('Admin team-pause error:', err);
    return res.status(500).json({ error: 'Failed to update team pause state.' });
  }
});

// POST /api/admin/team-restart - Restart an individual team back to Stage 1
router.post('/team-restart', requireAdmin, async (req, res) => {
  try {
    const { teamId } = req.body;
    const team = await ds.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const now = Date.now();
    await ds.resetTeamProgress(teamId, now);

    return res.json({ success: true, message: `Team ${team.name} has been restarted at Stage 1.` });
  } catch (err) {
    console.error('Admin team-restart error:', err);
    return res.status(500).json({ error: 'Failed to restart team.' });
  }
});

// POST /api/admin/restart-all - Restart all teams back to Waiting Lobby or Stage 1
router.post('/restart-all', requireAdmin, async (req, res) => {
  try {
    const { mode } = req.body; // 'lobby' or 'active'
    const now = Date.now();
    await ds.restartAllTeams(mode, now);

    const targetStatus = mode === 'active' ? 'active' : 'waiting';
    return res.json({ success: true, message: `All teams have been reset to ${targetStatus} mode.` });
  } catch (err) {
    console.error('Admin restart-all error:', err);
    return res.status(500).json({ error: 'Failed to restart all teams.' });
  }
});

// GET /api/admin/answers - Master Answer Key & Dynamic Team Solutions Reference
router.get('/answers', requireAdmin, async (req, res) => {
  try {
    const teams = await ds.getAllTeams();
    // Sort by name alphabetically
    teams.sort((a, b) => a.name.localeCompare(b.name));

    const teamIds = teams.map(t => t.id);
    const allMembers = await ds.getMembersForTeams(teamIds);

    const membersByTeam = {};
    allMembers.forEach(m => {
      if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = [];
      membersByTeam[m.teamId].push(m);
    });

    const teamSolutions = teams.map(t => {
      const members = membersByTeam[t.id] || [];
      const memberNames = members.map(m => m.fullName);

      const memberShards = memberNames.map(name => ({
        name,
        shard: getMemberShard(t.name, name)
      }));

      const stage5Code = computeTeamCode(t.name, memberNames);
      const stage6Key = computeFinalKey('NOVA', '7K2', 'ORBIT', '91X', stage5Code);

      return {
        teamId: t.id,
        teamName: t.name,
        coordinator: t.coordinator,
        memberShards,
        stage5Code,
        stage6Key
      };
    });

    return res.json({
      staticAnswers: {
        stage1: {
          title: 'Stage 1: Signal Intercept (Morse Matrix)',
          answer: 'NOVA',
          decoy: 'ZETA9',
          explanation: '4-Sector Morse Matrix: Oscilloscope (—• [N]), Binary Telemetry (——— [O]), Optical Strobe (•••— [V]), Satellite Relay (•— [A]) -> NOVA. Hint button reveals 15-char Morse chart.'
        },
        stage2: {
          title: 'Stage 2: Decoding',
          answer: '7K2',
          accessPhrase: 'AURORA',
          explanation: '3-layer cipher: Base64 decode -> Hex decode -> ROT13 unwrap reveals: "ACCESS PHRASE IS AURORA. FRAGMENT TWO IS 7K2. IGNORE ZETA9."'
        },
        stage3: {
          title: 'Stage 3: Prompt the AI (WARDEN)',
          answer: 'ORBIT',
          decoy: 'ZETA9',
          accessPhrase: 'AURORA',
          explanation: 'Offline AI rule engine. Requires access phrase AURORA, role declaration (e.g., "I am the maintenance technician"), task keyword (fragment/code/release), and >=10 words.'
        },
        stage4: {
          title: 'Stage 4: CTF Challenges',
          answer: '91X',
          explanation: 'Token 1 in HTML comment: <!-- token1 = 9 -->. Token 2 via terminal "cat vault-7f3a/note.txt" = 1. Token 3 via terminal "exif badge.jpg" = X. Combined: 9 + 1 + X = 91X.'
        }
      },
      teamSolutions
    });
  } catch (err) {
    console.error('Admin answers API error:', err);
    return res.status(500).json({ error: 'Failed to generate answer key.' });
  }
});

// GET /api/admin/notepad & POST /api/admin/notepad - Organiser Scratchpad & Winners
router.get('/notepad', requireAdmin, async (req, res) => {
  try {
    const notepad = await ds.getSetting('winnersNotepad', '');
    return res.json({ notepad });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get notepad.' });
  }
});

router.post('/notepad', requireAdmin, async (req, res) => {
  try {
    const { notepad } = req.body;
    await ds.setSetting('winnersNotepad', notepad || '');
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save notepad.' });
  }
});

// GET /api/admin/violations - Anti-cheat violations log
router.get('/violations', requireAdmin, async (req, res) => {
  try {
    const rows = await ds.getViolations(100);
    return res.json({ violations: rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get violations.' });
  }
});

// POST /api/admin/waive-penalty - Waive penalty minutes
router.post('/waive-penalty', requireAdmin, async (req, res) => {
  try {
    const { teamId, minutes } = req.body;
    const team = await ds.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const toRemove = parseInt(minutes, 10) || 0;
    const newPenalty = Math.max(0, (team.penaltyMin || 0) - toRemove);
    await ds.updateTeam(teamId, { penaltyMin: newPenalty });

    return res.json({ success: true, newPenalty });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to waive penalty.' });
  }
});

// POST /api/admin/skip - Skip stage for team
router.post('/skip', requireAdmin, async (req, res) => {
  try {
    const { teamId } = req.body;
    const team = await ds.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found.' });

    const now = Date.now();
    const nextStage = team.stage + 1;

    if (team.stage >= 6) {
      await ds.updateTeam(team.id, { finishedAt: now });
    } else {
      await ds.updateTeam(team.id, { stage: nextStage });
    }

    return res.json({ success: true, newStage: nextStage });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to skip stage.' });
  }
});

// POST /api/admin/reset-team - Reset or remove team
router.post('/reset-team', requireAdmin, async (req, res) => {
  try {
    const { teamId } = req.body;
    await ds.deleteTeam(teamId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete team.' });
  }
});

// POST /api/admin/reset-member-device - Reset member device binding
router.post('/reset-member-device', requireAdmin, async (req, res) => {
  try {
    const { memberId } = req.body;
    await ds.resetMemberDevice(memberId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reset device binding.' });
  }
});

// POST /api/admin/clock - Global clock control
router.post('/clock', requireAdmin, async (req, res) => {
  try {
    const { action } = req.body; // 'pause', 'resume', 'toggle', 'start', 'reset'
    const now = Date.now();

    const settings = await ds.getAllSettings();
    const isPaused = settings.clockPaused === 'true';
    const pauseStartedAt = parseInt(settings.pauseStartedAt || '0', 10) || 0;
    let eventStartedAt = parseInt(settings.eventStartedAt || '0', 10) || 0;

    let shouldPause = false;
    let shouldResume = false;

    if (action === 'start') {
      if (eventStartedAt === 0) {
        eventStartedAt = now;
        await ds.setSetting('eventStartedAt', String(now));
      }
      if (isPaused) shouldResume = true;
    } else if (action === 'pause' || action === 'stop') {
      shouldPause = !isPaused;
    } else if (action === 'resume') {
      shouldResume = isPaused;
    } else if (action === 'toggle') {
      if (isPaused) shouldResume = true;
      else shouldPause = true;
    } else if (action === 'reset') {
      await ds.setSetting('eventStartedAt', String(now));
      await ds.setSetting('totalPausedMs', '0');
      await ds.setSetting('clockPaused', 'false');
      await ds.setSetting('pauseStartedAt', '0');
      return res.json({ success: true, isPaused: false, eventStartedAt: now });
    }

    if (shouldPause) {
      await ds.setSetting('clockPaused', 'true');
      await ds.setSetting('pauseStartedAt', String(now));
      return res.json({ success: true, isPaused: true, eventStartedAt });
    } else if (shouldResume) {
      const duration = pauseStartedAt > 0 ? (now - pauseStartedAt) : 0;

      // Add paused duration to all active teams
      await ds.addPausedMsToActiveTeams(duration);

      // Update global totalPausedMs
      const prevTotal = parseInt(settings.totalPausedMs || '0', 10) || 0;
      await ds.setSetting('totalPausedMs', String(prevTotal + duration));
      await ds.setSetting('clockPaused', 'false');
      await ds.setSetting('pauseStartedAt', '0');
      return res.json({ success: true, isPaused: false, eventStartedAt });
    }

    return res.json({ success: true, isPaused, eventStartedAt });
  } catch (err) {
    console.error('Admin clock error:', err);
    return res.status(500).json({ error: 'Failed to update clock.' });
  }
});

// POST /api/admin/settings - Update settings like allowNewTeams or startTogetherMode
router.post('/settings', requireAdmin, async (req, res) => {
  try {
    const { allowNewTeams, startTogetherMode } = req.body;
    if (typeof allowNewTeams === 'boolean') {
      await ds.setSetting('allowNewTeams', allowNewTeams ? 'true' : 'false');
    }
    if (typeof startTogetherMode === 'boolean') {
      await ds.setSetting('startTogetherMode', startTogetherMode ? 'true' : 'false');
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update settings.' });
  }
});

// POST /api/admin/coordinator - Rename/assign coordinator
router.post('/coordinator', requireAdmin, async (req, res) => {
  try {
    const { teamId, coordinator } = req.body;
    if (!teamId || !coordinator) return res.status(400).json({ error: 'Missing teamId or coordinator' });
    await ds.updateTeam(teamId, { coordinator: coordinator.trim() });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update coordinator.' });
  }
});

// GET /api/admin/warden-logs - View WARDEN chat logs
router.get('/warden-logs', requireAdmin, async (req, res) => {
  try {
    const logs = await ds.getRecentWardenLogs(100);
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get warden logs.' });
  }
});

// GET /api/admin/export - CSV export
router.get('/export', requireAdmin, async (req, res) => {
  try {
    const teams = await ds.getAllTeams();
    teams.sort((a, b) => a.startedAt - b.startedAt);

    const teamIds = teams.map(t => t.id);
    const allMembers = await ds.getMembersForTeams(teamIds);
    const allProgress = await ds.getProgressForTeams(teamIds);

    const membersByTeam = {};
    allMembers.forEach(m => {
      if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = [];
      membersByTeam[m.teamId].push(m);
    });

    const progressByTeam = {};
    allProgress.forEach(p => {
      if (!progressByTeam[p.teamId]) progressByTeam[p.teamId] = [];
      progressByTeam[p.teamId].push(p);
    });

    const rows = [
      ['Team Name', 'Coordinator', 'Members', 'Stage', 'Status', 'Started At', 'Finished At', 'Total Time (mm:ss)', 'Penalty (min)', 'Tab Switches', 'Hints Used', 'Wrong Attempts', 'Verification Code']
    ];

    const now = Date.now();

    teams.forEach(t => {
      const members = (membersByTeam[t.id] || []).map(m => m.fullName).join('; ');
      const progress = progressByTeam[t.id] || [];
      const totalWrong = progress.reduce((acc, p) => acc + (p.wrongAttempts || 0), 0);
      const totalHints = progress.reduce((acc, p) => acc + (p.hintsUsed || 0), 0);

      let effectiveElapsedMs = t.finishedAt ? (t.finishedAt - t.startedAt - (t.pausedMs || 0)) : (now - t.startedAt - (t.pausedMs || 0));
      if (effectiveElapsedMs < 0) effectiveElapsedMs = 0;
      const totalSecs = Math.floor(effectiveElapsedMs / 1000) + (t.penaltyMin || 0) * 60;
      const timeStr = `${Math.floor(totalSecs / 60)}m ${totalSecs % 60}s`;

      let vCode = '';
      if (t.finishedAt) {
        vCode = generateVerificationCode(t.name, t.startedAt, t.finishedAt);
      }

      rows.push([
        `"${t.name.replace(/"/g, '""')}"`,
        `"${t.coordinator.replace(/"/g, '""')}"`,
        `"${members.replace(/"/g, '""')}"`,
        t.finishedAt ? '6/6 (Done)' : `${t.stage}/6`,
        t.finishedAt ? 'Completed' : (t.status === 'waiting' ? 'Waiting in Lobby' : (t.isPaused ? 'Paused' : 'In Progress')),
        new Date(t.startedAt).toISOString(),
        t.finishedAt ? new Date(t.finishedAt).toISOString() : 'N/A',
        `"${timeStr}"`,
        t.penaltyMin,
        t.tabSwitches || 0,
        totalHints,
        totalWrong,
        `"${vCode}"`
      ]);
    });

    const csv = rows.map(r => r.join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="final_override_results.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('Export error:', err);
    return res.status(500).json({ error: 'Failed to export CSV.' });
  }
});

module.exports = router;