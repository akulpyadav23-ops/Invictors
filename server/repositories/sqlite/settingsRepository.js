const { getDb } = require('./dbConnection');

class SqliteSettingsRepository {
  constructor(db = null) {
    this.db = db || getDb();
  }

  get(key, defaultValue = null) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  }

  getAll() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() || [];
    const map = {};
    for (const r of rows) {
      map[r.key] = r.value;
    }
    return map;
  }

  set(key, value) {
    const strVal = String(value);
    this.db
      .prepare(
        `
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `
      )
      .run(key, strVal);
    return true;
  }
}

module.exports = SqliteSettingsRepository;
