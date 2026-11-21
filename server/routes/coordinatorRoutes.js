const express = require('express');
const router = express.Router();
const { requireCoordinator } = require('../middleware/auth');
const { getRepositories } = require('../repositories');
const config = require('../config');
const clock = require('../lib/clock');
const rateLimiter = require('../lib/rateLimiter');
const { norm, generateVerificationCode } = require('../lib/hmac');

const repos = getRepositories();

// POST /api/coordinator/verify - Login with name + PIN (Phase 6.2)
router.post('/verify', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const rate = rateLimiter.consume(`coord_login:${ip}`, 5, 600000); // 5 attempts per 10 min
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    return res.status(429).json({ error: 'Too many login attempts. Please wait 10 minutes.' });
  }

  const { name, pin } = req.body || {};
  if (!name || !pin) {
    return res.status(400).json({ error: 'Coordinator name and PIN are required.' });
  }

  if (!config.verifyCoordinatorPin(name, pin)) {
    return res.status(401).json({ error: 'Invalid coordinator name or PIN.' });
  }

  res.cookie('fo_coord_name', name.trim(), { httpOnly: true, sameSite: 'lax' });
  res.cookie('fo_coord_pin', pin.trim(), { httpOnly: true, sameSite: 'lax' });

  return res.json({ success: true, coordinator: name.trim() });
});

// GET /api/coordinator - Coordinator Dashboard (sees only assigned teams)
router.get('/', requireCoordinator, (req, res) => {
  const coordName = req.coordinatorName;
  const allTeams = repos.teams.getAll();

  // Filter only teams assigned to this coordinator
  const matchedTeams = allTeams.filter((t) => norm(t.coordinator) === norm(coordName));

  const teamIds = matchedTeams.map((t) => t.id);
  const allMembers = repos.members.getForTeams(teamIds);
  const allProgress = repos.progress.getForTeams(teamIds);

  const membersByTeam = {};
  allMembers.forEach((m) => {
    if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = [];
    membersByTeam[m.teamId].push(m);
  });

  const progressByTeam = {};
  allProgress.forEach((p) => {
    if (!progressByTeam[p.teamId]) progressByTeam[p.teamId] = [];
    progressByTeam[p.teamId].push(p);
  });

  const now = clock.now();

  const teams = matchedTeams.map((t) => {
    const members = membersByTeam[t.id] || [];
    const prog = progressByTeam[t.id] || [];

    const totalWrong = prog.reduce((acc, p) => acc + (p.wrongAttempts || 0), 0);
    const totalHints = prog.reduce((acc, p) => acc + (p.hintsUsed || 0), 0);
    const effectiveElapsedMs = clock.computeEffectiveElapsedMs(t, now);
    const totalSeconds = Math.floor(effectiveElapsedMs / 1000) + (t.penaltyMin || 0) * 60;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    let status = 'In Progress';
    if (t.finishedAt) status = 'Completed';
    else if (t.status === 'waiting') status = 'Waiting in Lobby';
    else if (t.status === 'timeout') status = 'Timed Out';
    else if (t.isPaused === 1) status = 'Paused';

    const verificationCode = t.finishedAt ? generateVerificationCode(t.name, t.startedAt, t.finishedAt) : null;

    return {
      id: t.id,
      name: t.name,
      coordinator: t.coordinator,
      memberCount: t.memberCount,
      players: members.map((m) => m.fullName),
      stage: t.stage,
      stageText: t.finishedAt ? 'Completed' : t.status === 'waiting' ? 'Lobby' : `${t.stage}/6`,
      formattedTime,
      totalSeconds,
      penaltyMin: t.penaltyMin,
      totalHints,
      totalWrong,
      tabSwitches: t.tabSwitches || 0,
      verificationCode,
      status
    };
  });

  return res.json({
    coordinator: coordName,
    serverTime: now,
    teams
  });
});

module.exports = router;
