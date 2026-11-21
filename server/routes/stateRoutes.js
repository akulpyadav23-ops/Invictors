const express = require('express');
const router = express.Router();
const { requireLeader } = require('../middleware/auth');
const { getRepositories } = require('../repositories');
const { getMission } = require('../content/loader');
const Stage1Service = require('../services/stage1Service');
const Stage2Service = require('../services/stage2Service');
const Stage5Service = require('../services/stage5Service');
const HintService = require('../services/hintService');
const clock = require('../lib/clock');
const config = require('../config');
const { generateVerificationCode } = require('../lib/hmac');

const repos = getRepositories();
const stage1Service = new Stage1Service(repos);
const stage2Service = new Stage2Service(repos);
const stage5Service = new Stage5Service(repos);
const hintService = new HintService(repos);
const mission = getMission();

// GET /api/state - Live game state with ETag/Version optimization (Phase 3.B)
router.get('/', requireLeader, async (req, res, next) => {
  try {
    const team = repos.teams.getById(req.team.id);
    if (!team) return res.status(401).json({ error: 'Team not found.' });

    // Client polling support: ?since=version or If-None-Match
    const clientVersion = parseInt(req.query.since || req.headers['if-none-match'], 10);
    if (clientVersion && clientVersion === team.version) {
      // Return 304 or minimal unchanged payload
      return res.status(304).end();
    }

    const currentStage = team.stage;
    const now = clock.now();

    // Check time cap (A12)
    if (config.TIME_CAP_ENFORCED && team.status === 'active' && !team.finishedAt) {
      if (clock.isTimeCapExceeded(team, config.TIME_CAP_MINUTES, now)) {
        repos.teams.update(team.id, { status: 'timeout' });
        team.status = 'timeout';
      }
    }

    const settings = repos.settings.getAll();
    const isClockPaused = settings.clockPaused === 'true';
    const isGameStarted = settings.gameStarted === 'true';
    const allowNewTeams = settings.allowNewTeams === 'true';
    const isIndividuallyPaused = team.isPaused === 1;
    const isPaused = isClockPaused || isIndividuallyPaused;

    // Progress and solved fragments
    const progressRows = repos.progress.getByTeamId(team.id);
    const notebook = {};
    progressRows.forEach(row => {
      if (row.fragment) notebook[row.stage] = row.fragment;
    });

    const currentProg = progressRows.find(p => p.stage === currentStage) || { wrongAttempts: 0, hintsUsed: 0 };

    // Revealed hints with server countdowns
    const activeHints = hintService.getActiveHintsForStage(team, currentStage);

    // Members list
    const members = repos.members.getByTeamId(team.id);

    // Stage-specific isolated payload (downstream secrets never sent!)
    let stageContent = null;
    if (!team.finishedAt && team.status === 'active') {
      if (currentStage === 1) {
        stageContent = stage1Service.getStatePayload(team);
      } else if (currentStage === 2) {
        stageContent = stage2Service.getStatePayload(team);
      } else if (currentStage === 3) {
        stageContent = { aiActive: true };
      } else if (currentStage === 4) {
        stageContent = {
          briefing: mission.stages['4'].briefing,
          commentToken: mission.stages['4'].commentToken
        };
      } else if (currentStage === 5) {
        stageContent = stage5Service.getStatePayload(team);
      }
    }

    let verificationCode = null;
    if (team.finishedAt) {
      verificationCode = generateVerificationCode(team.name, team.startedAt, team.finishedAt);
    }

    res.setHeader('ETag', String(team.version));

    return res.json({
      team: {
        id: team.id,
        name: team.name,
        coordinator: team.coordinator,
        memberCount: team.memberCount,
        startedAt: team.startedAt,
        finishedAt: team.finishedAt,
        stage: team.stage,
        version: team.version,
        penaltyMin: team.penaltyMin,
        pausedMs: team.pausedMs,
        status: team.status,
        isPaused,
        isIndividuallyPaused,
        isClockPaused,
        tabSwitches: team.tabSwitches || 0
      },
      gameStarted: isGameStarted,
      waitingInLobby: team.status === 'waiting',
      waitingCount: repos.teams.getWaitingCount(),
      members: members.map(m => ({ fullName: m.fullName, isLeader: !!m.isLeader, hasJoined: m.deviceToken !== null })),
      currentProg: {
        wrongAttempts: currentProg.wrongAttempts,
        hintsUsed: currentProg.hintsUsed
      },
      revealedHints: activeHints,
      notebook,
      stageContent,
      serverTime: now,
      verificationCode,
      allowNewTeams
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
