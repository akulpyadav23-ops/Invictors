const { getDb } = require('./dbConnection');

class SqliteTeamRepository {
  constructor(db = null) {
    this.db = db || getDb();
  }

  getById(id) {
    if (!id) return null;
    return this.db.prepare('SELECT * FROM teams WHERE id = ?').get(id) || null;
  }

  getByToken(token) {
    if (!token) return null;
    return this.db.prepare('SELECT * FROM teams WHERE sessionToken = ?').get(token) || null;
  }

  getByName(name) {
    if (!name) return null;
    return this.db.prepare('SELECT * FROM teams WHERE name = ? COLLATE NOCASE').get(name.trim()) || null;
  }

  getByRecoveryCode(teamName, code) {
    if (!teamName || !code) return null;
    return this.db.prepare(
      'SELECT * FROM teams WHERE name = ? COLLATE NOCASE AND leaderRecoveryCode = ?'
    ).get(teamName.trim(), code.trim()) || null;
  }

  getAll() {
    return this.db.prepare('SELECT * FROM teams ORDER BY startedAt DESC').all() || [];
  }

  getWaitingCount() {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM teams WHERE status = 'waiting'").get();
    return row ? row.c : 0;
  }

  create(team) {
    const stmt = this.db.prepare(`
      INSERT INTO teams (
        id, name, coordinator, memberCount, startedAt, finishedAt, stage, version,
        penaltyMin, pausedMs, sessionToken, leaderRecoveryCode, leaderRecoveryExpiresAt,
        status, isPaused, teamPauseStartedAt, tabSwitches, seed, stage1EnteredAt,
        stage1OpensAt, chartVisibleUntil, stage2Order, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    stmt.run(
      team.id,
      team.name,
      team.coordinator,
      team.memberCount || 3,
      team.startedAt,
      team.finishedAt || null,
      team.stage || 1,
      1,
      team.penaltyMin || 0,
      team.pausedMs || 0,
      team.sessionToken,
      null,
      null,
      team.status || 'waiting',
      0,
      0,
      0,
      team.seed,
      team.stage1EnteredAt || null,
      team.stage1OpensAt || null,
      0,
      team.stage2Order || null,
      team.created_at || Date.now()
    );

    return this.getById(team.id);
  }

  update(id, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return true;

    // Increment version if version not explicitly provided
    let setKeys = [...keys];
    let values = keys.map(k => fields[k]);

    if (!keys.includes('version')) {
      setKeys.push('version = version + 1');
    }

    const setClause = setKeys.map(k => k.includes('=') ? k : `${k} = ?`).join(', ');
    values.push(id);

    this.db.prepare(`UPDATE teams SET ${setClause} WHERE id = ?`).run(...values);
    return true;
  }

  // Conditional update for concurrency isolation (Phase 3.E)
  updateConditional(id, currentStage, currentVersion, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return true;

    const setClause = keys.map(k => `${k} = ?`).join(', ') + ', version = version + 1';
    const values = keys.map(k => fields[k]);
    values.push(id, currentStage, currentVersion);

    const res = this.db.prepare(`
      UPDATE teams
      SET ${setClause}
      WHERE id = ? AND stage = ? AND version = ?
    `).run(...values);

    return res.changes > 0;
  }

  delete(id) {
    this.db.prepare('DELETE FROM teams WHERE id = ?').run(id);
    return true;
  }

  addPausedMsToActive(duration) {
    if (duration <= 0) return true;
    this.db.prepare('UPDATE teams SET pausedMs = pausedMs + ? WHERE finishedAt IS NULL AND status = "active"').run(duration);
    return true;
  }

  startAll(now) {
    const res = this.db.prepare(`
      UPDATE teams
      SET status = 'active', startedAt = ?
      WHERE status = 'waiting'
    `).run(now);
    return res.changes;
  }
}

module.exports = SqliteTeamRepository;
