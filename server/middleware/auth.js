const crypto = require('crypto');
const config = require('../config');
const { getRepositories } = require('../repositories');

const repos = getRepositories();

// Timing safe comparison helper
function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a).trim());
  const bufB = Buffer.from(String(b).trim());
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Require team leader session
async function requireLeader(req, res, next) {
  const token = req.cookies.fo_leader_token;
  if (!token) {
    return res.status(401).json({ error: 'No active squad leader session found.' });
  }

  const team = repos.teams.getByToken(token);
  if (!team) {
    return res.status(401).json({ error: 'Squad leader session invalid or expired.' });
  }

  req.team = team;
  next();
}

// Require member device token
async function requireMember(req, res, next) {
  const leaderToken = req.cookies.fo_leader_token;
  const memberToken = req.cookies.fo_member_token;

  if (leaderToken) {
    const team = repos.teams.getByToken(leaderToken);
    if (team) {
      req.team = team;
      req.isLeader = true;
      return next();
    }
  }

  if (memberToken) {
    const member = repos.members.getByDeviceToken(memberToken);
    if (member) {
      const team = repos.teams.getById(member.teamId);
      if (team) {
        req.team = team;
        req.member = member;
        req.isLeader = false;
        return next();
      }
    }
  }

  return res.status(401).json({ error: 'Operative authentication required.' });
}

// Require organizer admin PIN with constant-time compare
function requireAdmin(req, res, next) {
  const pin = req.headers['x-admin-pin'] || req.cookies.fo_admin_pin || req.body.pin || req.query.pin;
  if (!pin || !safeCompare(pin, config.ADMIN_PIN)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin PIN.' });
  }
  next();
}

// Require coordinator authentication with constant-time PIN check
function requireCoordinator(req, res, next) {
  const name = (req.headers['x-coordinator-name'] || req.query.name || req.body.name || '').trim();
  const pin = (req.headers['x-coordinator-pin'] || req.query.pin || req.body.pin || '').trim();

  // Admin access allowed to view coordinator endpoints
  const adminPin = req.headers['x-admin-pin'] || req.query.adminPin;
  if (adminPin && safeCompare(adminPin, config.ADMIN_PIN)) {
    req.coordinatorName = name || 'Admin';
    return next();
  }

  if (!name || !pin) {
    return res.status(401).json({ error: 'Coordinator name and PIN are required.' });
  }

  if (!config.verifyCoordinatorPin(name, pin)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Coordinator credentials.' });
  }

  req.coordinatorName = name;
  next();
}

module.exports = {
  safeCompare,
  requireLeader,
  requireMember,
  requireAdmin,
  requireCoordinator
};
