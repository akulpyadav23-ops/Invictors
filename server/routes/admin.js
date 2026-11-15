const express = require('express');
const router = express.Router();
const db = require('../db');
const config = require('../config');
const { generateVerificationCode } = require('../logic/security');
const { computeTeamCode, getMemberShard } = require('../logic/shard');
const { computeFinalKey } = require('../logic/finalKey');
const { STAGE_CONFIG } = require('../logic/stages');

// Admin PIN middleware
function requireAdmin(req, res, next) {
  const pin = req.headers['x-admin-pin'] || req.query.pin || req.body.pin;
  if (!pin || pin !== config.ADMIN_PIN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin PIN.' });
  }
  next();
}

// POST /api/admin/verify - Verify admin pin
router.post('/verify', (req, res) => {
  const pin = req.body.pin;
  if (pin === config.ADMIN_PIN) {
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Invalid Admin PIN.' });
});

// GET /api/admin/teams - List all teams with stats, clock, and settings
router.get('/teams', requireAdmin, (req, res) => {
  const teams = db.prepare('SELECT * FROM teams ORDER BY startedAt DESC').all();

  const clockPausedRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('clockPaused');
  const isClockPaused = clockPausedRow && clockPausedRow.value === 'true';

  const gameStartedRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('gameStarted');
  const isGameStarted = gameStartedRow && gameStartedRow.value === 'true';

  const startTogetherRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('startTogetherMode');
  const startTogetherMode = !startTogetherRow || startTogetherRow.value === 'true';

  const notepadRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('winnersNotepad');
  const notepad = notepadRow ? notepadRow.value : '';

  const now = Date.now();

  const fullTeams = teams.map(t => {
    const members = db.prepare('SELECT id, fullName, isLeader, deviceToken FROM members WHERE teamId = ?').all(t.id);
    const progress = db.prepare('SELECT stage, fragment, wrongAttempts, hintsUsed, solvedAt FROM progress WHERE teamId = ?').all(t.id);

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

  const allowNewTeamsRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('allowNewTeams');

  return res.json({
    teams: fullTeams,
    isClockPaused,
    isGameStarted,
    startTogetherMode,
    notepad,
    allowNewTeams: allowNewTeamsRow && allowNewTeamsRow.value === 'true',
    serverTime: now
  });
});

// POST /api/admin/start-all - Launch game simultaneously for all teams
router.post('/start-all', requireAdmin, (req, res) => {
  const now = Date.now();

  db.prepare("UPDATE settings SET value = 'true' WHERE key = 'gameStarted'").run();
  db.prepare("UPDATE settings SET value = ? WHERE key = 'eventStartedAt'").run(String(now));
  db.prepare("UPDATE settings SET value = 'false' WHERE key = 'clockPaused'").run();
  db.prepare("UPDATE settings SET value = '0' WHERE key = 'pauseStartedAt'").run();

  // Activate all waiting teams and set their startedAt to now
  const result = db.prepare("UPDATE teams SET status = 'active', startedAt = ? WHERE status = 'waiting'").run(now);

  return res.json({
    success: true,
    startedAt: now,
    activatedTeamsCount: result.changes
  });
});

// POST /api/admin/team-pause - Pause or resume an individual team
router.post('/team-pause', requireAdmin, (req, res) => {
  const { teamId, action } = req.body; // 'pause' or 'resume'
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const now = Date.now();

  if (action === 'pause') {
    db.prepare('UPDATE teams SET isPaused = 1, teamPauseStartedAt = ? WHERE id = ?').run(now, teamId);
    return res.json({ success: true, isPaused: true });
  } else if (action === 'resume') {
    const pauseStarted = team.teamPauseStartedAt || now;
    const duration = now - pauseStarted;
    const newPausedMs = (team.pausedMs || 0) + (duration > 0 ? duration : 0);

    db.prepare('UPDATE teams SET isPaused = 0, teamPauseStartedAt = 0, pausedMs = ? WHERE id = ?').run(newPausedMs, teamId);
    return res.json({ success: true, isPaused: false });
  }

  return res.json({ success: true, isPaused: team.isPaused === 1 });
});

// POST /api/admin/team-restart - Restart an individual team back to Stage 1
router.post('/team-restart', requireAdmin, (req, res) => {
  const { teamId } = req.body;
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const now = Date.now();

  const tx = db.transaction(() => {
    // Reset progress
    db.prepare('DELETE FROM progress WHERE teamId = ?').run(teamId);
    const insertProg = db.prepare('INSERT INTO progress (teamId, stage, fragment, wrongAttempts, hintsUsed, solvedAt) VALUES (?, ?, NULL, 0, 0, NULL)');
    for (let s = 1; s <= 6; s++) {
      insertProg.run(teamId, s);
    }

    // Reset team stats
    db.prepare(`
      UPDATE teams
      SET stage = 1,
          finishedAt = NULL,
          penaltyMin = 0,
          pausedMs = 0,
          isPaused = 0,
          teamPauseStartedAt = 0,
          tabSwitches = 0,
          startedAt = ?
      WHERE id = ?
    `).run(now, teamId);

    // Clear submissions & chat
    db.prepare('DELETE FROM submissions WHERE teamId = ?').run(teamId);
    db.prepare('DELETE FROM chat WHERE teamId = ?').run(teamId);
    db.prepare('DELETE FROM violations WHERE teamId = ?').run(teamId);
  });

  tx();

  return res.json({ success: true, message: `Team ${team.name} has been restarted at Stage 1.` });
});

// POST /api/admin/restart-all - Restart all teams back to Waiting Lobby or Stage 1
router.post('/restart-all', requireAdmin, (req, res) => {
  const { mode } = req.body; // 'lobby' or 'active'
  const now = Date.now();
  const targetStatus = mode === 'active' ? 'active' : 'waiting';

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM submissions').run();
    db.prepare('DELETE FROM chat').run();
    db.prepare('DELETE FROM violations').run();
    db.prepare('DELETE FROM progress').run();

    const teams = db.prepare('SELECT id FROM teams').all();
    const insertProg = db.prepare('INSERT INTO progress (teamId, stage, fragment, wrongAttempts, hintsUsed, solvedAt) VALUES (?, ?, NULL, 0, 0, NULL)');
    for (const t of teams) {
      for (let s = 1; s <= 6; s++) {
        insertProg.run(t.id, s);
      }
    }

    db.prepare(`
      UPDATE teams
      SET stage = 1,
          finishedAt = NULL,
          penaltyMin = 0,
          pausedMs = 0,
          isPaused = 0,
          teamPauseStartedAt = 0,
          tabSwitches = 0,
          startedAt = ?,
          status = ?
    `).run(now, targetStatus);

    db.prepare("UPDATE settings SET value = ? WHERE key = 'gameStarted'").run(mode === 'active' ? 'true' : 'false');
    db.prepare("UPDATE settings SET value = '0' WHERE key = 'eventStartedAt'").run();
    db.prepare("UPDATE settings SET value = '0' WHERE key = 'totalPausedMs'").run();
    db.prepare("UPDATE settings SET value = 'false' WHERE key = 'clockPaused'").run();
    db.prepare("UPDATE settings SET value = '0' WHERE key = 'pauseStartedAt'").run();
  });

  tx();

  return res.json({ success: true, message: `All teams have been reset to ${targetStatus} mode.` });
});

// GET /api/admin/answers - Master Answer Key & Dynamic Team Solutions Reference
router.get('/answers', requireAdmin, (req, res) => {
  const teams = db.prepare('SELECT id, name, coordinator FROM teams ORDER BY name ASC').all();

  const teamSolutions = teams.map(t => {
    const members = db.prepare('SELECT fullName FROM members WHERE teamId = ?').all(t.id);
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
        title: 'Stage 1: Media Analysis',
        answer: 'NOVA',
        decoy: 'ZETA9',
        explanation: 'Web Audio API Morse code pattern (-. --- ...- .- = NOVA). Decoy text ZETA9 flashes on monitor at 2.2s.'
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
});

// GET /api/admin/notepad & POST /api/admin/notepad - Organiser Scratchpad & Winners
router.get('/notepad', requireAdmin, (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'winnersNotepad'").get();
  return res.json({ notepad: row ? row.value : '' });
});

router.post('/notepad', requireAdmin, (req, res) => {
  const { notepad } = req.body;
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('winnersNotepad', ?)").run(notepad || '');
  return res.json({ success: true });
});

// GET /api/admin/violations - Anti-cheat violations log
router.get('/violations', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT v.id, v.teamId, t.name as teamName, v.type, v.details, v.penaltyAdded, v.at
    FROM violations v
    JOIN teams t ON v.teamId = t.id
    ORDER BY v.at DESC
  `).all();
  return res.json({ violations: rows });
});

// POST /api/admin/waive-penalty - Waive penalty minutes
router.post('/waive-penalty', requireAdmin, (req, res) => {
  const { teamId, minutes } = req.body;
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const toRemove = parseInt(minutes, 10) || 0;
  const newPenalty = Math.max(0, (team.penaltyMin || 0) - toRemove);
  db.prepare('UPDATE teams SET penaltyMin = ? WHERE id = ?').run(newPenalty, teamId);

  return res.json({ success: true, newPenalty });
});

// POST /api/admin/skip - Skip stage for team
router.post('/skip', requireAdmin, (req, res) => {
  const { teamId } = req.body;
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found.' });

  const now = Date.now();
  const nextStage = team.stage + 1;

  if (team.stage >= 6) {
    db.prepare('UPDATE teams SET finishedAt = ? WHERE id = ?').run(now, team.id);
  } else {
    db.prepare('UPDATE teams SET stage = ? WHERE id = ?').run(nextStage, team.id);
  }

  return res.json({ success: true, newStage: nextStage });
});

// POST /api/admin/reset-team - Reset or remove team
router.post('/reset-team', requireAdmin, (req, res) => {
  const { teamId } = req.body;
  db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);
  return res.json({ success: true });
});

// POST /api/admin/reset-member-device - Reset member device binding
router.post('/reset-member-device', requireAdmin, (req, res) => {
  const { memberId } = req.body;
  db.prepare('UPDATE members SET deviceToken = NULL WHERE id = ?').run(memberId);
  return res.json({ success: true });
});

// POST /api/admin/clock - Global clock control
router.post('/clock', requireAdmin, (req, res) => {
  const { action } = req.body; // 'pause', 'resume', 'toggle', 'start', 'reset'
  const now = Date.now();

  const clockPausedRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('clockPaused');
  const isPaused = clockPausedRow && clockPausedRow.value === 'true';

  const pauseStartedRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('pauseStartedAt');
  const pauseStartedAt = parseInt(pauseStartedRow ? pauseStartedRow.value : '0', 10) || 0;

  const eventStartedRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('eventStartedAt');
  let eventStartedAt = parseInt(eventStartedRow ? eventStartedRow.value : '0', 10) || 0;

  let shouldPause = false;
  let shouldResume = false;

  if (action === 'start') {
    if (eventStartedAt === 0) {
      eventStartedAt = now;
      db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(now), 'eventStartedAt');
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
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(now), 'eventStartedAt');
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('0', 'totalPausedMs');
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('false', 'clockPaused');
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('0', 'pauseStartedAt');
    return res.json({ success: true, isPaused: false, eventStartedAt: now });
  }

  if (shouldPause) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('true', 'clockPaused');
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(now), 'pauseStartedAt');
    return res.json({ success: true, isPaused: true, eventStartedAt });
  } else if (shouldResume) {
    const duration = pauseStartedAt > 0 ? (now - pauseStartedAt) : 0;

    // Add paused duration to all active teams
    db.prepare('UPDATE teams SET pausedMs = pausedMs + ? WHERE finishedAt IS NULL').run(duration);

    // Update global totalPausedMs
    const totalPausedRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('totalPausedMs');
    const prevTotal = parseInt(totalPausedRow ? totalPausedRow.value : '0', 10) || 0;
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(prevTotal + duration), 'totalPausedMs');

    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('false', 'clockPaused');
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('0', 'pauseStartedAt');
    return res.json({ success: true, isPaused: false, eventStartedAt });
  }

  return res.json({ success: true, isPaused, eventStartedAt });
});

// POST /api/admin/settings - Update settings like allowNewTeams or startTogetherMode
router.post('/settings', requireAdmin, (req, res) => {
  const { allowNewTeams, startTogetherMode } = req.body;
  if (typeof allowNewTeams === 'boolean') {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(allowNewTeams ? 'true' : 'false', 'allowNewTeams');
  }
  if (typeof startTogetherMode === 'boolean') {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(startTogetherMode ? 'true' : 'false', 'startTogetherMode');
  }
  return res.json({ success: true });
});

// POST /api/admin/coordinator - Rename/assign coordinator
router.post('/coordinator', requireAdmin, (req, res) => {
  const { teamId, coordinator } = req.body;
  if (!teamId || !coordinator) return res.status(400).json({ error: 'Missing teamId or coordinator' });
  db.prepare('UPDATE teams SET coordinator = ? WHERE id = ?').run(coordinator.trim(), teamId);
  return res.json({ success: true });
});

// GET /api/admin/warden-logs - View WARDEN chat logs
router.get('/warden-logs', requireAdmin, (req, res) => {
  const logs = db.prepare(`
    SELECT c.id, c.teamId, t.name as teamName, c.role, c.text, c.at
    FROM chat c
    JOIN teams t ON c.teamId = t.id
    ORDER BY c.at DESC
  `).all();
  return res.json({ logs });
});

// GET /api/admin/export - CSV export
router.get('/export', requireAdmin, (req, res) => {
  const teams = db.prepare('SELECT * FROM teams ORDER BY startedAt ASC').all();

  const rows = [
    ['Team Name', 'Coordinator', 'Members', 'Stage', 'Status', 'Started At', 'Finished At', 'Total Time (mm:ss)', 'Penalty (min)', 'Tab Switches', 'Hints Used', 'Wrong Attempts', 'Verification Code']
  ];

  teams.forEach(t => {
    const members = db.prepare('SELECT fullName FROM members WHERE teamId = ?').all(t.id).map(m => m.fullName).join('; ');
    const progress = db.prepare('SELECT stage, wrongAttempts, hintsUsed FROM progress WHERE teamId = ?').all(t.id);
    const totalWrong = progress.reduce((acc, p) => acc + (p.wrongAttempts || 0), 0);
    const totalHints = progress.reduce((acc, p) => acc + (p.hintsUsed || 0), 0);

    const now = Date.now();
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
});

module.exports = router;
