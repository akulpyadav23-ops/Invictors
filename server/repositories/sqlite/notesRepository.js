const { getDb } = require('./dbConnection');

class SqliteNotesRepository {
  constructor(db = null) {
    this.db = db || getDb();
  }

  get(teamId) {
    const row = this.db.prepare('SELECT notes, updatedAt FROM team_notes WHERE teamId = ?').get(teamId);
    return row ? row.notes : '';
  }

  save(teamId, notes) {
    const cleanNotes = String(notes || '').slice(0, 1000);
    this.db
      .prepare(
        `
      INSERT INTO team_notes (teamId, notes, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(teamId) DO UPDATE SET notes = excluded.notes, updatedAt = excluded.updatedAt
    `
      )
      .run(teamId, cleanNotes, Date.now());
    return cleanNotes;
  }
}

module.exports = SqliteNotesRepository;
