const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const ds = require('../dataService');
const config = require('../config');
const { norm, hashAnswer, generateToken, generateVerificationCode } = require('../logic/security');
const { STAGE_CONFIG } = require('../logic/stages');
const { getMemberShard, computeTeamCode } = require('../logic/shard');
const { computeFinalKey } = require('../logic/finalKey');

// In-memory rate limiting map: teamId -> lastSubmitTimestamp
const lastSubmissions = new Map();

// Middleware to get current team from leader token
async function requireTeam(req, res, next) {
  try {
    const token = req.cookies.fo_leader_token;
    if (!token) {
      return res.status(401).json({ error: 'No active mission session found.' });
    }
    const team = await ds.getTeamByToken(token);
    if (!team) {
      return res.status(401).json({ error: 'Team session invalid or expired.' });
    }
    req.team = team;
    next();
  } catch (err) {
    console.error('requireTeam error:', err);
    return res.status(500).json({ error: 'Session verification failed.' });
  }
}

// POST /api/teams - Register team
router.post('/teams', async (req, res) => {
  try {
    const { teamName, coordinator, member1, member2, member3, member4 } = req.body;

    const rawTeamName = (teamName || '').trim();
    const rawCoord = (coordinator || '').trim();

    if (!rawTeamName || !rawCoord) {
      return res.status(400).json({ error: 'Please enter the team name and the event coordinator name.' });
    }

    if (rawTeamName.length > 24) {
      return res.status(400).json({ error: 'Team name cannot exceed 24 characters.' });
    }

    const rawMembers = [member1, member2, member3, member4]
      .map(m => (m || '').trim())
      .filter(Boolean);

    if (rawMembers.length < 3) {
      return res.status(400).json({ error: 'A team needs at least 3 players. Enter 3 or 4 full names.' });
    }

    // Check unique member names (case-insensitive)
    const normMembers = rawMembers.map(m => norm(m));
    const uniqueNorms = new Set(normMembers);
    if (uniqueNorms.size !== rawMembers.length) {
      return res.status(400).json({ error: 'Each member must have a different name.' });
    }

    // Check duplicate team name (case-insensitive)
    const existing = await ds.getTeamByName(rawTeamName);
    if (existing) {
      return res.status(400).json({ error: 'Team name is already taken. Please choose another name.' });
    }

    const teamId = crypto.randomUUID();
    const sessionToken = generateToken();
    const now = Date.now();

    // Check start together mode setting
    const startTogetherVal = await ds.getSetting('startTogetherMode', 'true');
    const gameStartedVal = await ds.getSetting('gameStarted', 'false');
    const isStartTogether = startTogetherVal === 'true';
    const isGameStarted = gameStartedVal === 'true';

    const initialStatus = (isStartTogether && !isGameStarted) ? 'waiting' : 'active';

    const membersData = [
      { id: crypto.randomUUID(), teamId, fullName: rawMembers[0], isLeader: 1, deviceToken: null }
    ];
    for (let i = 1; i < rawMembers.length; i++) {
      membersData.push({ id: crypto.randomUUID(), teamId, fullName: rawMembers[i], isLeader: 0, deviceToken: null });
    }

    await ds.createTeam({
      team: {
        id: teamId,
        name: rawTeamName,
        coordinator: rawCoord,
        startedAt: now,
        finishedAt: null,
        stage: 1,
        penaltyMin: 0,
        pausedMs: 0,
        sessionToken,
        status: initialStatus,
        isPaused: 0,
        teamPauseStartedAt: 0,
        tabSwitches: 0
      },
      members: membersData,
      stages: 6
    });

    res.cookie('fo_leader_token', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    return res.json({
      success: true,
      team: {
        id: teamId,
        name: rawTeamName,
        coordinator: rawCoord,
        startedAt: now,
        stage: 1,
        status: initialStatus
      }
    });
  } catch (err) {
    console.error('Register team error:', err);
    return res.status(500).json({ error: 'Failed to register team: ' + err.message });
  }
});

// GET /api/state - Current game state
router.get('/state', requireTeam, async (req, res) => {
  try {
    const team = await ds.getTeamById(req.team.id);
    if (!team) return res.status(401).json({ error: 'Team not found' });
    const currentStage = team.stage;

    // Global pause status & game started status
    const settings = await ds.getAllSettings();
    const isClockPaused = settings.clockPaused === 'true';
    const isGameStarted = settings.gameStarted === 'true';
    const allowNewTeams = settings.allowNewTeams === 'true';

    const isIndividuallyPaused = team.isPaused === 1;
    const isPaused = isClockPaused || isIndividuallyPaused;

    const waitingCount = await ds.getWaitingTeamsCount();

    // Get solved fragments from progress
    const progressRows = await ds.getProgress(team.id);

    const notebook = {};
    progressRows.forEach(row => {
      if (row.fragment) {
        notebook[row.stage] = row.fragment;
      }
    });

    const currentProg = progressRows.find(p => p.stage === currentStage) || { wrongAttempts: 0, hintsUsed: 0 };

    const stageConfig = STAGE_CONFIG[currentStage] || {};
    const revealedHints = (stageConfig.hints || []).slice(0, currentProg.hintsUsed);

    // Members
    const members = await ds.getMembers(team.id);
    const totalMembers = members.length;
    // Distinct joined devices count:
    const joinedMembers = members.filter(m => m.isLeader === 1 || m.deviceToken !== null);
    const joinedCount = joinedMembers.length;

    const leaderMember = members.find(m => m.isLeader === 1);
    const leaderShard = leaderMember ? getMemberShard(team.name, leaderMember.fullName) : null;

    // Build stage-specific payload (ISOLATION ENFORCED: future stage details are never returned)
    let stageContent = null;
    if (team.finishedAt || team.status === 'waiting') {
      // Waiting or Finished
    } else if (currentStage === 1) {
      stageContent = {
        morsePattern: stageConfig.morsePattern
      };
    } else if (currentStage === 2) {
      stageContent = {
        encodedText: stageConfig.encodedText
      };
    } else if (currentStage === 3) {
      stageContent = {
        aiActive: true
      };
    } else if (currentStage === 4) {
      stageContent = {
        commentToken: stageConfig.commentToken
      };
    } else if (currentStage === 5) {
      stageContent = {
        joinedCount,
        totalMembers,
        leaderShard,
        members: members.map(m => m.fullName)
      };
    } else if (currentStage === 6) {
      stageContent = {
        notebook
      };
    }

    let verificationCode = null;
    if (team.finishedAt) {
      verificationCode = generateVerificationCode(team.name, team.startedAt, team.finishedAt);
    }

    return res.json({
      team: {
        id: team.id,
        name: team.name,
        coordinator: team.coordinator,
        startedAt: team.startedAt,
        finishedAt: team.finishedAt,
        stage: team.stage,
        penaltyMin: team.penaltyMin,
        pausedMs: team.pausedMs,
        status: team.status,
        isPaused: isPaused,
        isIndividuallyPaused,
        isClockPaused,
        tabSwitches: team.tabSwitches || 0
      },
      gameStarted: isGameStarted,
      waitingInLobby: team.status === 'waiting',
      waitingCount,
      members: members.map(m => ({ fullName: m.fullName, isLeader: !!m.isLeader })),
      currentProg: {
        wrongAttempts: currentProg.wrongAttempts,
        hintsUsed: currentProg.hintsUsed
      },
      revealedHints,
      notebook,
      stageContent,
      serverTime: Date.now(),
      verificationCode,
      allowNewTeams
    });
  } catch (err) {
    console.error('State API error:', err);
    return res.status(500).json({ error: 'Failed to retrieve game state.' });
  }
});

// POST /api/submit - Submit answer
router.post('/submit', requireTeam, async (req, res) => {
  try {
    const team = await ds.getTeamById(req.team.id);
    if (!team) return res.status(401).json({ error: 'Team not found.' });

    if (team.finishedAt) {
      return res.status(400).json({ error: 'Mission already completed.' });
    }

    if (team.status === 'waiting') {
      return res.status(400).json({ error: 'The game has not started yet. Waiting for organiser to launch! 🚀' });
    }

    const clockPausedVal = await ds.getSetting('clockPaused', 'false');
    const isClockPaused = clockPausedVal === 'true';
    if (isClockPaused || team.isPaused === 1) {
      return res.status(400).json({ error: 'Mission is currently paused by organisers. Submissions are temporarily on hold.' });
    }

    // Rate limit: 1 submission per second per team
    const now = Date.now();
    const lastTime = lastSubmissions.get(team.id) || 0;
    if (now - lastTime < 1000) {
      return res.status(429).json({ error: 'Please wait a second before submitting again.' });
    }
    lastSubmissions.set(team.id, now);

    const stage = team.stage;
    const rawAnswer = req.body.answer;
    const normalizedInput = norm(rawAnswer);

    if (!normalizedInput) {
      return res.status(400).json({ error: 'Answer cannot be empty.' });
    }

    const members = await ds.getMembers(team.id);

    let isCorrect = false;
    let fragmentFound = null;

    if (stage === 1) {
      isCorrect = normalizedInput === 'NOVA';
      fragmentFound = 'NOVA';
    } else if (stage === 2) {
      isCorrect = normalizedInput === '7K2';
      fragmentFound = '7K2';
    } else if (stage === 3) {
      isCorrect = normalizedInput === 'ORBIT';
      fragmentFound = 'ORBIT';
    } else if (stage === 4) {
      isCorrect = normalizedInput === '91X';
      fragmentFound = '91X';
    } else if (stage === 5) {
      // Check device requirement: at least 3 distinct member sessions must have joined
      const joinedDistinct = members.filter(m => m.isLeader === 1 || m.deviceToken !== null);
      if (joinedDistinct.length < 3) {
        return res.status(400).json({
          error: 'Waiting for your teammates to join on their own laptops. 🤝'
        });
      }

      const memberNames = members.map(m => m.fullName);
      const expectedTeamCode = computeTeamCode(team.name, memberNames);
      isCorrect = normalizedInput === norm(expectedTeamCode);
      fragmentFound = expectedTeamCode;
    } else if (stage === 6) {
      // Stage 6 final key
      const progressList = await ds.getProgress(team.id);
      const fMap = {};
      progressList.forEach(p => { fMap[p.stage] = p.fragment; });

      // Fallbacks if somehow missing
      const f1 = fMap[1] || 'NOVA';
      const f2 = fMap[2] || '7K2';
      const f3 = fMap[3] || 'ORBIT';
      const f4 = fMap[4] || '91X';
      const memberNames = members.map(m => m.fullName);
      const f5 = fMap[5] || computeTeamCode(team.name, memberNames);

      const expectedKey = computeFinalKey(f1, f2, f3, f4, f5);
      isCorrect = normalizedInput === norm(expectedKey);
      fragmentFound = expectedKey;
    }

    // Record submission log
    await ds.addSubmission({
      teamId: team.id,
      stage,
      valueHash: hashAnswer(normalizedInput),
      ok: isCorrect ? 1 : 0,
      at: now
    });

    const progressRows = await ds.getProgress(team.id);
    const prog = progressRows.find(p => p.stage === stage) || { wrongAttempts: 0, hintsUsed: 0 };

    if (isCorrect) {
      // Update progress
      await ds.updateProgress(team.id, stage, {
        fragment: fragmentFound,
        solvedAt: now
      });

      let finishedAt = null;
      let nextStage = stage + 1;

      if (stage === 6) {
        finishedAt = now;
        nextStage = 6;
        await ds.updateTeam(team.id, { finishedAt });
      } else {
        await ds.updateTeam(team.id, { stage: nextStage });
      }

      let verificationCode = null;
      if (finishedAt) {
        verificationCode = generateVerificationCode(team.name, team.startedAt, finishedAt);
      }

      return res.json({
        success: true,
        stage,
        nextStage,
        fragment: fragmentFound,
        finished: !!finishedAt,
        verificationCode
      });
    } else {
      // Incorrect answer
      const newWrong = (prog ? prog.wrongAttempts : 0) + 1;
      let extraPenalty = 0;
      if (newWrong > 5) {
        extraPenalty = 1; // +1 min penalty
      }

      const newTeamPenalty = (team.penaltyMin || 0) + extraPenalty;

      await ds.updateProgress(team.id, stage, { wrongAttempts: newWrong });

      if (extraPenalty > 0) {
        await ds.updateTeam(team.id, { penaltyMin: newTeamPenalty });
      }

      return res.json({
        success: false,
        wrongAttempts: newWrong,
        penaltyApplied: newWrong > 5,
        totalPenaltyMin: newTeamPenalty
      });
    }
  } catch (err) {
    console.error('Submit API error:', err);
    return res.status(500).json({ error: 'Failed to process submission.' });
  }
});

// POST /api/hint - Request a hint for current stage
router.post('/hint', requireTeam, async (req, res) => {
  try {
    const team = await ds.getTeamById(req.team.id);
    if (!team) return res.status(401).json({ error: 'Team not found.' });

    if (team.finishedAt) {
      return res.status(400).json({ error: 'Mission already completed.' });
    }

    if (team.status === 'waiting') {
      return res.status(400).json({ error: 'The game has not started yet.' });
    }

    const clockPausedVal = await ds.getSetting('clockPaused', 'false');
    const isClockPaused = clockPausedVal === 'true';
    if (isClockPaused || team.isPaused === 1) {
      return res.status(400).json({ error: 'Mission is paused by organisers.' });
    }

    const stage = team.stage;
    const stageConfig = STAGE_CONFIG[stage];
    if (!stageConfig || !stageConfig.hints) {
      return res.status(400).json({ error: 'No hints available for this mission.' });
    }

    const progressRows = await ds.getProgress(team.id);
    const prog = progressRows.find(p => p.stage === stage) || { hintsUsed: 0 };
    const currentHintsUsed = prog.hintsUsed || 0;

    if (currentHintsUsed >= 2) {
      return res.status(400).json({ error: 'Maximum hints (2) already unlocked for this mission.' });
    }

    const cost = currentHintsUsed === 0 ? 3 : 5; // First hint +3 min, second +5 min
    const newHintsUsed = currentHintsUsed + 1;
    const newPenalty = (team.penaltyMin || 0) + cost;

    await ds.updateProgress(team.id, stage, { hintsUsed: newHintsUsed });
    await ds.updateTeam(team.id, { penaltyMin: newPenalty });

    const unlockedHint = stageConfig.hints[newHintsUsed - 1];

    return res.json({
      success: true,
      hintsUsed: newHintsUsed,
      hint: unlockedHint,
      penaltyMin: newPenalty
    });
  } catch (err) {
    console.error('Hint API error:', err);
    return res.status(500).json({ error: 'Failed to unlock hint.' });
  }
});

// POST /api/tab-penalty - Anti-cheat tab switch penalty
router.post('/tab-penalty', requireTeam, async (req, res) => {
  try {
    const currentTeam = await ds.getTeamById(req.team.id);
    if (!currentTeam || currentTeam.finishedAt || currentTeam.status === 'waiting') {
      return res.json({ success: false });
    }

    const now = Date.now();
    const newSwitches = (currentTeam.tabSwitches || 0) + 1;
    const penaltyToAdd = 2; // +2 min penalty per tab switch
    const newTotalPenalty = (currentTeam.penaltyMin || 0) + penaltyToAdd;

    await ds.updateTeam(currentTeam.id, {
      tabSwitches: newSwitches,
      penaltyMin: newTotalPenalty
    });

    await ds.addViolation({
      teamId: currentTeam.id,
      type: 'tab_switch',
      details: `Tab switched or left mission screen (violation #${newSwitches})`,
      penaltyAdded: penaltyToAdd,
      at: now
    });

    return res.json({
      success: true,
      tabSwitches: newSwitches,
      penaltyAdded: penaltyToAdd,
      totalPenaltyMin: newTotalPenalty
    });
  } catch (err) {
    console.error('Tab penalty API error:', err);
    return res.status(500).json({ error: 'Failed to record penalty.' });
  }
});

// POST /api/join - Joining as a team member
router.post('/join', async (req, res) => {
  try {
    const { teamName, fullName } = req.body;

    const rawTeam = (teamName || '').trim();
    const rawName = (fullName || '').trim();

    if (!rawTeam || !rawName) {
      return res.status(400).json({ error: 'Please enter team name and your full name.' });
    }

    // Refuse if request carries the leader's session cookie
    const leaderToken = req.cookies.fo_leader_token;
    if (leaderToken) {
      const leaderTeam = await ds.getTeamByToken(leaderToken);
      if (leaderTeam) {
        return res.status(403).json({
          error: 'This device is running the team. Please use your own laptop to get your shard. 🙂'
        });
      }
    }

    // Find team (case/space-insensitive)
    const allTeams = await ds.getAllTeams();
    const targetTeam = allTeams.find(t => norm(t.name) === norm(rawTeam));
    if (!targetTeam) {
      return res.status(404).json({ error: 'Team not found. Please check the team name.' });
    }

    // Find member in team (case/space-insensitive)
    const teamMembers = await ds.getMembers(targetTeam.id);
    const targetMember = teamMembers.find(m => norm(m.fullName) === norm(rawName));

    if (!targetMember) {
      return res.status(404).json({ error: 'Member name not found in this team. Check exact spelling.' });
    }

    // Device binding check
    let memberToken = req.cookies.fo_member_token;

    if (targetMember.deviceToken) {
      // If already bound, check if current cookie matches
      if (memberToken !== targetMember.deviceToken) {
        return res.status(403).json({
          error: 'This member name is already bound to another device. Contact the admin if you need a reset.'
        });
      }
    } else {
      // If another member has already claimed this browser's device token, prevent re-use
      if (memberToken) {
        const alreadyClaimed = teamMembers.find(m => m.deviceToken === memberToken && m.id !== targetMember.id);
        if (alreadyClaimed) {
          return res.status(403).json({
            error: 'This device is already bound to another team member.'
          });
        }
      } else {
        memberToken = generateToken();
      }

      await ds.updateMember(targetMember.id, { deviceToken: memberToken });
    }

    // Set member cookie
    res.cookie('fo_member_token', memberToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    const memberShard = getMemberShard(targetTeam.name, targetMember.fullName);

    return res.json({
      success: true,
      team: targetTeam.name,
      name: targetMember.fullName,
      shard: memberShard
    });
  } catch (err) {
    console.error('Join API error:', err);
    return res.status(500).json({ error: 'Failed to join team: ' + err.message });
  }
});

// POST /api/new-team - Clear leader session to register a new team (if allowed by admin)
router.post('/new-team', async (req, res) => {
  try {
    const allowNewTeamsVal = await ds.getSetting('allowNewTeams', 'false');
    if (allowNewTeamsVal !== 'true') {
      return res.status(403).json({ error: 'Admin has not enabled new team registration yet.' });
    }

    res.clearCookie('fo_leader_token');
    res.clearCookie('fo_member_token');
    return res.json({ success: true });
  } catch (err) {
    console.error('New team API error:', err);
    return res.status(500).json({ error: 'Failed to reset session.' });
  }
});

module.exports = router;