const path = require('path');
const fs = require('fs');

let DatabaseLib = null;
let isNodeSqlite = false;

try {
  DatabaseLib = require('better-sqlite3');
} catch {
  try {
    const { DatabaseSync } = require('node:sqlite');
    DatabaseLib = DatabaseSync;
    isNodeSqlite = true;
  } catch (err2) {
    throw new Error('Neither better-sqlite3 nor node:sqlite is available in this Node runtime: ' + err2.message);
  }
}

class UnifiedDatabase {
  constructor(dbPath, options = {}) {
    this.dbPath = dbPath;
    this.isNodeSqlite = isNodeSqlite;

    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    if (this.isNodeSqlite) {
      this.rawDb = new DatabaseLib(dbPath, options);
      // Run pragmas
      this.rawDb.exec('PRAGMA journal_mode = WAL;');
      this.rawDb.exec('PRAGMA foreign_keys = ON;');
      this.rawDb.exec('PRAGMA busy_timeout = 5000;');
      this.rawDb.exec('PRAGMA synchronous = NORMAL;');
    } else {
      this.rawDb = new DatabaseLib(dbPath, options);
      this.rawDb.pragma('journal_mode = WAL');
      this.rawDb.pragma('foreign_keys = ON');
      this.rawDb.pragma('busy_timeout = 5000');
      this.rawDb.pragma('synchronous = NORMAL');
    }
  }

  pragma(str) {
    if (this.isNodeSqlite) {
      return this.rawDb.exec(`PRAGMA ${str};`);
    }
    return this.rawDb.pragma(str);
  }

  exec(sql) {
    return this.rawDb.exec(sql);
  }

  prepare(sql) {
    const stmt = this.rawDb.prepare(sql);
    if (!this.isNodeSqlite) {
      return stmt;
    }

    // Wrap node:sqlite StatementSync to match better-sqlite3 API
    return {
      run(...args) {
        // Flatten array if passed as array
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        const res = stmt.run(...params);
        return {
          changes: res.changes,
          lastInsertRowid: res.lastInsertRowid
        };
      },
      get(...args) {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        return stmt.get(...params) || null;
      },
      all(...args) {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        return stmt.all(...params) || [];
      }
    };
  }

  // Phase 3.A: Atomic BEGIN IMMEDIATE transaction wrapper
  transaction(fn) {
    if (!this.isNodeSqlite && typeof this.rawDb.transaction === 'function') {
      const tx = this.rawDb.transaction(fn);
      return (...args) => tx.immediate(...args);
    }

    // Custom immediate transaction implementation for node:sqlite
    return (...args) => {
      this.rawDb.exec('BEGIN IMMEDIATE;');
      try {
        const result = fn(...args);
        this.rawDb.exec('COMMIT;');
        return result;
      } catch (err) {
        try {
          this.rawDb.exec('ROLLBACK;');
        } catch (_) {}
        throw err;
      }
    };
  }

  close() {
    if (this.rawDb && typeof this.rawDb.close === 'function') {
      this.rawDb.close();
    }
  }
}

let instance = null;

function getDb(customPath = null) {
  if (customPath) {
    return new UnifiedDatabase(customPath);
  }
  if (!instance) {
    const config = require('../../config');
    const targetPath = process.env.NODE_ENV === 'test'
      ? (process.env.TEST_DB_PATH || path.join(__dirname, '..', '..', '..', 'data', 'test.db'))
      : (config.DB_PATH || path.join(__dirname, '..', '..', '..', 'data', 'final_override.db'));
    instance = new UnifiedDatabase(targetPath);
  }
  return instance;
}

function setDb(db) {
  instance = db;
}

module.exports = {
  UnifiedDatabase,
  getDb,
  setDb
};
