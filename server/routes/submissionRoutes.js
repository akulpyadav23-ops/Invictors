const express = require('express');
const router = express.Router();
const { requireLeader } = require('../middleware/auth');
const { getRepositories } = require('../repositories');
const { getMission } = require('../content/loader');
const Stage1Service = require('../services/stage1Service');
const Stage2Service = require('../services/stage2Service');
const Stage5Service = require('../services/stage5Service');
const lock = require('../lib/lock');
const idempotency = require('../lib/idempotency');
const rateLimiter = require('../lib/rateLimiter');
const clock = require('../lib/clock');
const cache = require('../lib/cache');
const { norm, hashAnswer, generateVerificationCode } = require('../lib/hmac');

const repos = getRepositories();
const stage1Service = new Stage1Service(repos);
const stage2Service = new Stage2Service(repos);
const stage5Service = new Stage5Service(repos);
const mission = getMission();

// POST /api/submit - Submit answer (Phase 3.A: Mutex lock + BEGIN IMMEDIATE transaction)
router.post('/', requireLeader, async (req, res, next) => {
  const teamId = req.team.id;
  const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;

  // Idempotency check: if key already processed, return stored result without charging
  if (idempotencyKey) {
    const cachedResponse = idempotency.get(idempotencyKey);
    if (cachedResponse) {
      return res.status(cachedResponse.status).json(cachedResponse.data);
    }
  }

  // Rate limit: 1 submission per second per team
  const rateCheck = rateLimiter.consume(`submit:${teamId}`, 1, 1000);
  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
    return res.status(429).json({ error: 'Please wait a second before submitting again.' });
  }

  // Serialize same-team submissions using per-team async lock
  await lock.withLock(teamId, async () => {
    try {
      const team = repos.teams.getById(teamId);
      if (!team) return res.status(401).json({ error: 'Team not found.' });

      if (team.finishedAt) {
        return res.status(400).json({ error: 'Mission already completed.' });
      }

      if (team.status === 'waiting') {
        return res.status(400).json({ error: 'The mission has not started yet. Waiting for organizer launch.' });
      }

      if (team.status === 'timeout') {
        return res.status(400).json({ error: 'Mission time cap has elapsed. Submissions are closed.' });
      }

      // Check global & team pause
      const isClockPaused = repos.settings.get('clockPaused', 'false') === 'true';
      if (isClockPaused || team.isPaused === 1) {
        return res.status(400).json({ error: 'Mission is currently paused by organizers. Submissions are on hold.' });
      }

      const stage = team.stage;
      const rawAnswer = req.body.answer;
      if (!rawAnswer || !String(rawAnswer).trim()) {
        return res.status(400).json({ error: 'Answer cannot be empty.' });
      }

      const now = clock.now();
      const rawValue = String(rawAnswer).trim().slice(0, 100);
      const normalizedInput = norm(rawAnswer);

      // Solved notebook fragments
      const progressList = repos.progress.getByTeamId(team.id);
      const notebook = {};
      progressList.forEach(p => { if (p.fragment) notebook[p.stage] = p.fragment; });

      let isCorrect = false;
      let fragmentFound = null;
      let requiresLowercaseNotice = false;
      let isDecoy = false;

      if (stage === 1) {
        const val = stage1Service.validateSubmission(team, normalizedInput);
        isCorrect = val.isCorrect;
        fragmentFound = val.fragment;
        isDecoy = val.isDecoy;
      } else if (stage === 2) {
        const val = stage2Service.validateSubmission(team, rawAnswer);
        if (val.requiresLowercaseNotice) {
          // Special rule A5: uppercase or mixed case returns lowercase message and DOES NOT count as wrong try!
          return res.status(200).json({
            success: false,
            message: val.message,
            wrongAttempts: progressList.find(p => p.stage === 2)?.wrongAttempts || 0,
            penaltyApplied: false,
            totalPenaltyMin: team.penaltyMin || 0
          });
        }
        isCorrect = val.isCorrect;
        fragmentFound = val.fragment;
      } else if (stage === 3) {
        isCorrect = normalizedInput === mission.stages['3'].answer;
        fragmentFound = isCorrect ? mission.stages['3'].answer : null;
        if (normalizedInput === mission.stages['3'].decoy) isDecoy = true;
      } else if (stage === 4) {
        isCorrect = normalizedInput === mission.stages['4'].answer;
        fragmentFound = isCorrect ? mission.stages['4'].answer : null;
      } else if (stage === 5) {
        const val = stage5Service.validateSubmission(team, rawAnswer, notebook);
        isCorrect = val.isCorrect;
        fragmentFound = val.expectedAnswer;
      }

      // Record submission attempt
      repos.submissions.add({
        teamId: team.id,
        stage,
        valueHash: hashAnswer(normalizedInput),
        rawValue,
        ok: isCorrect ? 1 : 0,
        idempotencyKey,
        at: now
      });

      const prog = repos.progress.getByTeamAndStage(team.id, stage) || { wrongAttempts: 0, hintsUsed: 0 };

      let responsePayload = null;
      let responseStatus = 200;

      if (isCorrect) {
        const nextStage = stage < 5 ? stage + 1 : 5;
        const finishedAt = stage === 5 ? now : null;

        repos.transaction(() => {
          repos.progress.update(team.id, stage, {
            fragment: fragmentFound,
            solvedAt: now
          });

          const updateFields = {
            stage: nextStage,
            finishedAt: finishedAt || null
          };

          if (stage === 1) {
            updateFields.stage1OpensAt = now;
          }

          repos.teams.update(team.id, updateFields);
        })();

        cache.invalidatePrefix('leaderboard');

        let verificationCode = null;
        if (finishedAt) {
          verificationCode = generateVerificationCode(team.name, team.startedAt, finishedAt);
        }

        responsePayload = {
          success: true,
          stage,
          nextStage,
          fragment: fragmentFound,
          finished: !!finishedAt,
          verificationCode
        };
      } else {
        // Wrong attempt penalty escalation per A11:
        // First 5 wrong attempts free per team, each subsequent wrong attempt = +1 min
        const newWrong = (prog.wrongAttempts || 0) + 1;
        let extraPenalty = 0;
        if (newWrong > 5) {
          extraPenalty = 1;
        }

        const newTeamPenalty = (team.penaltyMin || 0) + extraPenalty;

        repos.transaction(() => {
          repos.progress.update(team.id, stage, { wrongAttempts: newWrong });
          if (extraPenalty > 0) {
            repos.teams.update(team.id, { penaltyMin: newTeamPenalty });
          }
        })();

        cache.invalidatePrefix('leaderboard');

        responsePayload = {
          success: false,
          wrongAttempts: newWrong,
          penaltyApplied: extraPenalty > 0,
          totalPenaltyMin: newTeamPenalty,
          isDecoy: !!isDecoy
        };
      }

      if (idempotencyKey) {
        idempotency.set(idempotencyKey, { status: responseStatus, data: responsePayload });
      }

      return res.status(responseStatus).json(responsePayload);
    } catch (err) {
      next(err);
    }
  });
});

module.exports = router;
