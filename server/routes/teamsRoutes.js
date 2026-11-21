const express = require('express');
const router = express.Router();
const TeamService = require('../services/teamService');

const teamService = new TeamService();

// POST /api/teams or /api/teams/register - Register team (3 or 4 members, A3)
const handleRegister = async (req, res, next) => {
  try {
    const { teamName, coordinator, member1, member2, member3, member4 } = req.body || {};
    const result = await teamService.registerTeam({
      teamName,
      coordinator,
      member1,
      member2,
      member3,
      member4
    });

    res.cookie('fo_leader_token', result.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    return res.json({
      success: true,
      team: {
        id: result.team.id,
        name: result.team.name,
        coordinator: result.team.coordinator,
        memberCount: result.team.memberCount,
        startedAt: result.team.startedAt,
        stage: result.team.stage,
        status: result.team.status
      }
    });
  } catch (err) {
    next(err);
  }
};

router.post('/', handleRegister);
router.post('/register', handleRegister);

// POST /api/teams/resume - Resume as squad leader using 6-digit recovery code (Phase 4.1)
router.post('/resume', async (req, res, next) => {
  try {
    const { teamName, recoveryCode } = req.body || {};
    const result = await teamService.resumeLeaderSession(teamName, recoveryCode);

    res.cookie('fo_leader_token', result.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    return res.json({
      success: true,
      message: 'Squad leader session successfully recovered.',
      team: {
        id: result.team.id,
        name: result.team.name,
        stage: result.team.stage
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
