const config = require('../config');
const { getDb } = require('./sqlite/dbConnection');

const SqliteTeamRepository = require('./sqlite/teamRepository');
const SqliteMemberRepository = require('./sqlite/memberRepository');
const SqliteProgressRepository = require('./sqlite/progressRepository');
const SqliteSubmissionRepository = require('./sqlite/submissionRepository');
const SqliteHintRepository = require('./sqlite/hintRepository');
const SqliteChatRepository = require('./sqlite/chatRepository');
const SqliteViolationRepository = require('./sqlite/violationRepository');
const SqliteNotesRepository = require('./sqlite/notesRepository');
const SqliteSettingsRepository = require('./sqlite/settingsRepository');
const SqliteAuditRepository = require('./sqlite/auditRepository');

function createRepositories(dbInstance = null) {
  const provider = config.DB_PROVIDER || 'sqlite';

  if (provider === 'supabase') {
    const SupabaseStub = require('./supabase.stub');
    return new SupabaseStub();
  }

  if (provider === 'firebase') {
    const FirebaseStub = require('./firebase.stub');
    return new FirebaseStub();
  }

  const db = dbInstance || getDb();

  return {
    teams: new SqliteTeamRepository(db),
    members: new SqliteMemberRepository(db),
    progress: new SqliteProgressRepository(db),
    submissions: new SqliteSubmissionRepository(db),
    hints: new SqliteHintRepository(db),
    chat: new SqliteChatRepository(db),
    violations: new SqliteViolationRepository(db),
    notes: new SqliteNotesRepository(db),
    settings: new SqliteSettingsRepository(db),
    audit: new SqliteAuditRepository(db),
    transaction: (fn) => db.transaction(fn),
    exec: (sql) => db.exec(sql),
    rawDb: db
  };
}

let defaultRepositories = null;

function getRepositories() {
  if (!defaultRepositories) {
    defaultRepositories = createRepositories();
  }
  return defaultRepositories;
}

module.exports = {
  createRepositories,
  getRepositories
};
