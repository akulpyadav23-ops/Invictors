const crypto = require('crypto');
const { getRepositories } = require('../repositories');
const { norm, generateToken, deriveMemberShard } = require('../lib/hmac');
const { getMission } = require('../content/loader');
const clock = require('../lib/clock');

class TeamService {
  constructor(repos = null) {
    this.repos = repos || getRepositories();
  }

  async registerTeam({ teamName, coordinator, member1, member2, member3, member4 }) {
    const rawName = (teamName || '').trim();
    const rawCoord = (coordinator || '').trim();

    if (!rawName || !rawCoord) {
      throw { status: 400, message: 'Please enter the team name and select an event coordinator.' };
    }

    if (rawName.length > 24) {
      throw { status: 400, message: 'Team name cannot exceed 24 characters.' };
    }

    if (/[<>]/.test(rawName)) {
      throw { status: 400, message: 'Team name cannot contain invalid characters (< or >).' };
    }

    // Filter non-empty members
    const rawMembers = [member1, member2, member3, member4]
      .map(m => (m || '').trim())
      .filter(Boolean);

    if (rawMembers.length < 3 || rawMembers.length > 4) {
      throw { status: 400, message: 'A team needs 3 or 4 players. Member 4 is optional.' };
    }

    // Validate unique member names
    const normNames = rawMembers.map(m => norm(m));
    const uniqueNorms = new Set(normNames);
    if (uniqueNorms.size !== rawMembers.length) {
      throw { status: 400, message: 'Each team member must have a distinct name.' };
    }

    // Check duplicate team name case-insensitively
    const existing = this.repos.teams.getByName(rawName);
    if (existing) {
      throw { status: 400, message: 'Team name is already taken. Please choose another name.' };
    }

    const teamId = crypto.randomUUID();
    const sessionToken = generateToken();
    const now = clock.now();
    const seed = crypto.randomBytes(16).toString('hex');

    // Check Start Together mode setting
    const startTogetherVal = this.repos.settings.get('startTogetherMode', 'true');
    const gameStartedVal = this.repos.settings.get('gameStarted', 'false');
    const isStartTogether = startTogetherVal === 'true';
    const isGameStarted = gameStartedVal === 'true';
    const initialStatus = (isStartTogether && !isGameStarted) ? 'waiting' : 'active';

    // Seeded assignment for Stage 5 code formats (A10)
    // 4-player: 2 mixed + 2 alpha; 3-player: 2 mixed + 1 alpha
    const memberCount = rawMembers.length;
    const formatTypes = memberCount === 4 ? ['mixed', 'mixed', 'alpha', 'alpha'] : ['mixed', 'mixed', 'alpha'];

    // Deterministic shuffle using seed
    const seedNum = parseInt(seed.slice(0, 8), 16);
    if (seedNum % 2 === 1) {
      formatTypes.reverse();
    }

    // Leader device token is set to a unique token for the leader session
    const leaderDeviceToken = generateToken();

    const membersData = rawMembers.map((name, idx) => {
      const format = formatTypes[idx] || 'mixed';
      const shard = deriveMemberShard(rawName, name, format);
      return {
        id: crypto.randomUUID(),
        teamId,
        fullName: name,
        isLeader: idx === 0 ? 1 : 0,
        deviceToken: idx === 0 ? leaderDeviceToken : null,
        assignedCodeType: format,
        assignedShard: shard,
        joinedAt: idx === 0 ? now : null
      };
    });

    // Stage 1 timings: 60s memorise window (A14)
    const stage1EnteredAt = initialStatus === 'active' ? now : null;
    const stage1OpensAt = initialStatus === 'active' ? now + 60000 : null;

    let createdTeam = null;
    const tx = this.repos.transaction(() => {
      createdTeam = this.repos.teams.create({
        id: teamId,
        name: rawName,
        coordinator: rawCoord,
        memberCount,
        startedAt: now,
        finishedAt: null,
        stage: 1,
        status: initialStatus,
        sessionToken,
        seed,
        stage1EnteredAt,
        stage1OpensAt,
        created_at: now
      });

      this.repos.members.createBatch(membersData);
      this.repos.progress.initForTeam(teamId, 5);
    });

    tx();

    return {
      team: createdTeam,
      sessionToken,
      leaderDeviceToken
    };
  }

  async joinMember({ teamName, fullName, existingMemberToken, existingLeaderToken }) {
    const rawTeamName = (teamName || '').trim();
    const rawFullName = (fullName || '').trim();

    if (!rawTeamName || !rawFullName) {
      throw { status: 400, message: 'Please provide both team name and your full name.' };
    }

    // Security: Device isolation (Phase 4.6 / Test 9)
    // A browser that already holds a leader token cannot claim another member's code
    if (existingLeaderToken) {
      const leaderTeam = this.repos.teams.getByToken(existingLeaderToken);
      if (leaderTeam) {
        throw { status: 403, message: 'This device is running the team leader console. Please join from a separate player device.' };
      }
    }

    const team = this.repos.teams.getByName(rawTeamName);
    if (!team) {
      throw { status: 404, message: 'Team not found. Please verify the exact team name.' };
    }

    const members = this.repos.members.getByTeamId(team.id);
    const matchedMember = members.find(m => norm(m.fullName) === norm(rawFullName));

    if (!matchedMember) {
      throw { status: 404, message: 'Operative name not found in registered squad roster.' };
    }

    // Check if token belongs to someone else
    if (existingMemberToken) {
      const currentTokenMember = this.repos.members.getByDeviceToken(existingMemberToken);
      if (currentTokenMember && currentTokenMember.id !== matchedMember.id) {
        throw { status: 403, message: 'This device is already bound to another operative session.' };
      }
    }

    // Issue or reuse deviceToken
    let deviceToken = matchedMember.deviceToken;
    const now = clock.now();

    if (!deviceToken) {
      deviceToken = generateToken();
      this.repos.members.update(matchedMember.id, {
        deviceToken,
        joinedAt: now
      });
    }

    return {
      memberToken: deviceToken,
      member: {
        id: matchedMember.id,
        fullName: matchedMember.fullName,
        teamName: team.name,
        shard: matchedMember.assignedShard,
        assignedCodeType: matchedMember.assignedCodeType
      }
    };
  }

  async reissueLeaderSession(teamId, actor = 'admin') {
    const team = this.repos.teams.getById(teamId);
    if (!team) throw { status: 404, message: 'Team not found' };

    // 6-digit recovery code valid for 10 minutes
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = clock.now() + 10 * 60 * 1000;

    this.repos.teams.update(teamId, {
      leaderRecoveryCode: code,
      leaderRecoveryExpiresAt: expiresAt
    });

    this.repos.audit.log({
      actor,
      action: 'reissue_leader_session',
      targetId: teamId,
      oldValue: null,
      newValue: { code, expiresAt }
    });

    return { code, expiresAt };
  }

  async resumeLeaderSession(teamName, recoveryCode) {
    const rawName = (teamName || '').trim();
    const rawCode = (recoveryCode || '').trim();

    const team = this.repos.teams.getByRecoveryCode(rawName, rawCode);
    if (!team) {
      throw { status: 401, message: 'Invalid team name or recovery code.' };
    }

    if (clock.now() > team.leaderRecoveryExpiresAt) {
      throw { status: 400, message: 'Leader recovery code has expired. Please contact an organizer.' };
    }

    // Invalidate old session and code, generate fresh leader token
    const newSessionToken = generateToken();
    this.repos.teams.update(team.id, {
      sessionToken: newSessionToken,
      leaderRecoveryCode: null,
      leaderRecoveryExpiresAt: null
    });

    this.repos.audit.log({
      actor: 'leader_recovery',
      action: 'session_resumed',
      targetId: team.id,
      newValue: { at: clock.now() }
    });

    return { sessionToken: newSessionToken, team };
  }
}

module.exports = TeamService;
