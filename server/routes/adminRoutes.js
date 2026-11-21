const express = require('express');
const router = express.Router();
const { requireAdmin, safeCompare } = require('../middleware/auth');
const { getRepositories } = require('../repositories');
const { getMission } = require('../content/loader');
const config = require('../config');
const clock = require('../lib/clock');
const cache = require('../lib/cache');
const rateLimiter = require('../lib/rateLimiter');
const AdminService = require('../services/adminService');
const TeamService = require('../services/teamService');
const HintService = require('../services/hintService');
const Stage5Service = require('../services/stage5Service');
const { generateVerificationCode } = require('../lib/hmac');

const repos = getRepositories();
const adminService = new AdminService(repos);
const teamService = new TeamService(repos);
const hintService = new HintService(repos);
const stage5Service = new Stage5Service(repos);
const mission = getMission();

// Admin session tracking
const adminSessions = new Map();
const ADMIN_HEARTBEAT_TTL = 30000;

function pruneSessions() {
  const cutoff = clock.now() - ADMIN_HEARTBEAT_TTL;
  for (const [id, s] of adminSessions.entries()) {
    if (s.lastSeen < cutoff) adminSessions.delete(id);
  }
}

// POST /api/admin/verify - Constant-time PIN verification & rate limiting (Phase 6.1, 8.2)
router.post('/verify', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const rate = rateLimiter.consume(`admin_login:${ip}`, 5, 600000); // 5 attempts per 10 min
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    return res.status(429).json({ error: 'Too many admin login attempts. Please wait 10 minutes.' });
  }

  const { pin, sessionId } = req.body || {};
  if (!adminService.verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid Admin PIN.' });
  }

  pruneSessions();
  const limit = config.ADMIN_SESSION_LIMIT || 2;
  if (!sessionId && adminSessions.size >= limit) {
    return res.status(429).json({ error: `Admin portal session cap reached (${limit} active sessions). Please close another tab.` });
  }

  const assignedSessionId = sessionId || crypto.randomUUID();
  adminSessions.set(assignedSessionId, { lastSeen: clock.now() });

  res.cookie('fo_admin_pin', pin.trim(), { httpOnly: true, sameSite: 'lax' });

  return res.json({ success: true, sessionId: assignedSessionId });
});

// POST /api/admin/heartbeat
router.post('/heartbeat', requireAdmin, (req, res) => {
  const { sessionId } = req.body || {};
  if (sessionId) {
    adminSessions.set(sessionId, { lastSeen: clock.now() });
  }
  pruneSessions();
  return res.json({ ok: true, activeSessions: adminSessions.size });
});

// POST /api/admin/logout-session
router.post('/logout-session', (req, res) => {
  const { sessionId } = req.body || {};
  if (sessionId) adminSessions.delete(sessionId);
  return res.json({ ok: true });
});

// GET /api/admin/teams
router.get('/teams', requireAdmin, (req, res) => {
  const teams = repos.teams.getAll();
  const teamIds = teams.map(t => t.id);

  const allMembers = repos.members.getForTeams(teamIds);
  const allProgress = repos.progress.getForTeams(teamIds);

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

  const settings = repos.settings.getAll();
  const now = clock.now();

  const fullTeams = teams.map(t => {
    const members = membersByTeam[t.id] || [];
    const prog = progressByTeam[t.id] || [];

    const totalWrong = prog.reduce((acc, p) => acc + (p.wrongAttempts || 0), 0);
    const totalHints = prog.reduce((acc, p) => acc + (p.hintsUsed || 0), 0);
    const effectiveElapsedMs = clock.computeEffectiveElapsedMs(t, now);
    const totalSeconds = Math.floor(effectiveElapsedMs / 1000) + (t.penaltyMin || 0) * 60;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const verificationCode = t.finishedAt ? generateVerificationCode(t.name, t.startedAt, t.finishedAt) : null;

    return {
      ...t,
      memberCount: t.memberCount || members.length,
      members,
      progress: prog,
      totalHints,
      totalWrong,
      totalSeconds,
      formattedTime,
      verificationCode,
      isFinished: !!t.finishedAt,
      isIndividuallyPaused: t.isPaused === 1,
      tabSwitches: t.tabSwitches || 0,
      status: t.status || 'waiting'
    };
  });

  return res.json({
    teams: fullTeams,
    isClockPaused: settings.clockPaused === 'true',
    isGameStarted: settings.gameStarted === 'true',
    startTogetherMode: settings.startTogetherMode !== 'false',
    leaderboardFrozen: settings.leaderboardFrozen === 'true',
    notepad: settings.winnersNotepad || '',
    allowNewTeams: settings.allowNewTeams === 'true',
    serverTime: now
  });
});

// POST /api/admin/start-all - Launch game
router.post('/start-all', requireAdmin, (req, res) => {
  const now = clock.now();
  repos.transaction(() => {
    repos.settings.set('gameStarted', 'true');
    repos.settings.set('eventStartedAt', String(now));
    repos.settings.set('clockPaused', 'false');
    repos.settings.set('pauseStartedAt', '0');
    repos.teams.startAll(now);
  })();

  cache.clear();
  return res.json({ success: true, startedAt: now });
});

// POST /api/admin/team-pause
router.post('/team-pause', requireAdmin, (req, res, next) => {
  try {
    const { teamId, action } = req.body || {};
    const result = adminService.toggleTeamPause(teamId, action);
    cache.clear();
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/team-restart
router.post('/team-restart', requireAdmin, (req, res, next) => {
  try {
    const { teamId } = req.body || {};
    const result = adminService.resetTeamProgress(teamId);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/reissue-leader - 6-digit recovery code (Phase 4.1)
router.post('/reissue-leader', requireAdmin, async (req, res, next) => {
  try {
    const { teamId } = req.body || {};
    const result = await teamService.reissueLeaderSession(teamId);
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/hints - Central hint management (Phase 5.4)
router.get('/hints', requireAdmin, (req, res) => {
  const allHints = hintService.getAllHintsForAdmin();
  const stages = {};
  for (let s = 1; s <= 5; s++) {
    const stg = mission.stages[String(s)];
    stages[s] = {
      stage: s,
      name: stg ? stg.name : `Stage ${s}`,
      icon: stg ? stg.icon : 'flag',
      hints: allHints.filter(h => h.stage === s)
    };
  }
  return res.json({ stages, allHints });
});

// PUT /api/admin/hints/:id - Live edit hint
router.put('/hints/:id', requireAdmin, (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = hintService.updateHintByAdmin(id, req.body);
    cache.invalidatePrefix('leaderboard');
    return res.json({ success: true, hint: updated });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/export.csv
router.get('/export.csv', requireAdmin, (req, res) => {
  const csv = adminService.generateCsvExport();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="final_override_standings.csv"');
  return res.send(csv);
});

// GET /api/admin/export.json
router.get('/export.json', requireAdmin, (req, res) => {
  const teams = repos.teams.getAll();
  return res.json({ exportedAt: clock.now(), teams });
});

// GET /api/admin/answers - Master Answer Key reference (A5: uppercase answer format)
router.get('/answers', requireAdmin, (req, res) => {
  const teams = repos.teams.getAll();
  teams.sort((a, b) => a.name.localeCompare(b.name));

  const teamIds = teams.map(t => t.id);
  const allMembers = repos.members.getForTeams(teamIds);

  const membersByTeam = {};
  allMembers.forEach(m => {
    if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = [];
    membersByTeam[m.teamId].push(m);
  });

  const teamSolutions = teams.map(t => {
    const members = membersByTeam[t.id] || [];
    const memberCodes = members.map(m => m.assignedShard);
    const fragments = {
      1: mission.stages['1'].answer,
      2: mission.stages['2'].answer.toUpperCase(),
      3: mission.stages['3'].answer,
      4: mission.stages['4'].answer
    };
    const finalKey = stage5Service.deriveFinalAnswer(t.name, memberCodes, fragments);

    return {
      teamId: t.id,
      teamName: t.name,
      coordinator: t.coordinator,
      memberShards: members.map(m => ({ name: m.fullName, shard: m.assignedShard, type: m.assignedCodeType })),
      stage5FinalKey: finalKey
    };
  });

  return res.json({
    staticAnswers: {
      stage1: { title: 'Stage 1: Signal Intercept', answer: mission.stages['1'].answer },
      stage2: { title: 'Stage 2: Decoding', answer: mission.stages['2'].answer.toUpperCase(), accessPhrase: mission.stages['2'].accessPhrase },
      stage3: { title: 'Stage 3: Prompt the AI', answer: mission.stages['3'].answer, decoy: mission.stages['3'].decoy },
      stage4: { title: 'Stage 4: CTF Challenges', answer: mission.stages['4'].answer }
    },
    teamSolutions
  });
});

// GET /api/admin/violations
router.get('/violations', requireAdmin, (req, res) => {
  const rows = repos.violations.getAll(100);
  return res.json({ violations: rows });
});

// POST /api/admin/waive-penalty
router.post('/waive-penalty', requireAdmin, (req, res, next) => {
  try {
    const { teamId, minutesToWaive } = req.body || {};
    const team = repos.teams.getById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const waive = Math.max(0, parseInt(minutesToWaive, 10) || 0);
    const newPenalty = Math.max(0, (team.penaltyMin || 0) - waive);
    repos.teams.update(teamId, { penaltyMin: newPenalty });
    cache.clear();

    return res.json({ success: true, penaltyMin: newPenalty });
  } catch (err) {
    next(err);
  }
});

// GET & POST /api/admin/notepad
router.get('/notepad', requireAdmin, (req, res) => {
  const notepad = repos.settings.get('winnersNotepad', '');
  return res.json({ notepad });
});

router.post('/notepad', requireAdmin, (req, res) => {
  const { notepad } = req.body || {};
  repos.settings.set('winnersNotepad', notepad || '');
  return res.json({ success: true });
});

// POST /api/admin/freeze-toggle
router.post('/freeze-toggle', requireAdmin, (req, res) => {
  const current = repos.settings.get('leaderboardFrozen', 'false') === 'true';
  repos.settings.set('leaderboardFrozen', current ? 'false' : 'true');
  cache.clear();
  return res.json({ success: true, isFrozen: !current });
});

// POST /api/admin/skip - Skip stage for testing/admin advance
router.post('/skip', requireAdmin, (req, res, next) => {
  try {
    const { teamId } = req.body || {};
    const team = repos.teams.getById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const currentStage = team.stage;
    const nextStage = currentStage < 5 ? currentStage + 1 : 5;
    const now = clock.now();

    repos.transaction(() => {
      repos.progress.update(team.id, currentStage, {
        fragment: mission.stages[String(currentStage)]?.answer || 'SKIPPED',
        solvedAt: now
      });
      repos.teams.update(team.id, {
        stage: nextStage,
        stage1OpensAt: now
      });
    })();

    cache.clear();
    return res.json({ success: true, stage: nextStage });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/submissions/:teamId - Raw value dispute review (Phase 4.1 / 6.1)
router.get('/submissions/:teamId', requireAdmin, (req, res) => {
  const { teamId } = req.params;
  const submissions = repos.submissions.getRawSubmissionsForAdmin(teamId, 100);
  return res.json({ submissions });
});

module.exports = router;
