const { getDb } = require('./dbConnection');

class SqliteMemberRepository {
  constructor(db = null) {
    this.db = db || getDb();
  }

  getByTeamId(teamId) {
    return (
      this.db.prepare('SELECT * FROM members WHERE teamId = ? ORDER BY isLeader DESC, fullName ASC').all(teamId) || []
    );
  }

  getByDeviceToken(token) {
    if (!token) return null;
    return this.db.prepare('SELECT * FROM members WHERE deviceToken = ?').get(token) || null;
  }

  getForTeams(teamIds) {
    if (!teamIds || teamIds.length === 0) return [];
    const placeholders = teamIds.map(() => '?').join(',');
    return (
      this.db
        .prepare(`SELECT * FROM members WHERE teamId IN (${placeholders}) ORDER BY fullName ASC`)
        .all(...teamIds) || []
    );
  }

  create(member) {
    this.db
      .prepare(
        `
      INSERT INTO members (id, teamId, fullName, isLeader, deviceToken, assignedCodeType, assignedShard, joinedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        member.id,
        member.teamId,
        member.fullName,
        member.isLeader ? 1 : 0,
        member.deviceToken || null,
        member.assignedCodeType || 'mixed',
        member.assignedShard || null,
        member.joinedAt || null
      );
  }

  createBatch(members) {
    const stmt = this.db.prepare(`
      INSERT INTO members (id, teamId, fullName, isLeader, deviceToken, assignedCodeType, assignedShard, joinedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const m of members) {
      stmt.run(
        m.id,
        m.teamId,
        m.fullName,
        m.isLeader ? 1 : 0,
        m.deviceToken || null,
        m.assignedCodeType || 'mixed',
        m.assignedShard || null,
        m.joinedAt || null
      );
    }
  }

  update(id, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return true;
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => fields[k]);
    values.push(id);
    this.db.prepare(`UPDATE members SET ${setClause} WHERE id = ?`).run(...values);
    return true;
  }

  resetDevice(memberId) {
    this.db.prepare('UPDATE members SET deviceToken = NULL, joinedAt = NULL WHERE id = ?').run(memberId);
    return true;
  }

  resetAllDevicesForTeam(teamId) {
    // Keep leader device, reset other members
    this.db
      .prepare('UPDATE members SET deviceToken = NULL, joinedAt = NULL WHERE teamId = ? AND isLeader = 0')
      .run(teamId);
    return true;
  }
}

module.exports = SqliteMemberRepository;
