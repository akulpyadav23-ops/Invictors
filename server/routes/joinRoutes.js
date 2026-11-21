const express = require('express');
const router = express.Router();
const TeamService = require('../services/teamService');

const teamService = new TeamService();

// POST /api/join - Operative join from individual device
router.post('/', async (req, res, next) => {
  try {
    const { teamName, fullName } = req.body || {};
    const existingMemberToken = req.cookies.fo_member_token;
    const existingLeaderToken = req.cookies.fo_leader_token;

    const result = await teamService.joinMember({
      teamName,
      fullName,
      existingMemberToken,
      existingLeaderToken
    });

    res.cookie('fo_member_token', result.memberToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    return res.json({
      success: true,
      name: result.member.fullName,
      team: result.member.teamName,
      shard: result.member.shard,
      assignedCodeType: result.member.assignedCodeType
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
