/**
 * Safe Database Wipe Script (Audit requirement V)
 * Requires explicit confirmation flag --yes or --confirm to prevent accidental loss.
 */

require('dotenv').config();
const { getDb } = require('../server/repositories/sqlite/dbConnection');

const args = process.argv.slice(2);
const confirmed = args.includes('--yes') || args.includes('--confirm');

if (!confirmed) {
  console.error('\n⚠️  SAFETY WARNING: You are attempting to wipe all tournament data.');
  console.error('To proceed, you must pass the confirmation flag:');
  console.error('   node scripts/wipe.js --yes\n');
  process.exit(1);
}

async function runSafeWipe() {
  console.log('🧹 Confirmed. Starting full tournament database purge...');
  const db = getDb();

  const tx = db.transaction(() => {
    db.exec(`
      DELETE FROM audit_log;
      DELETE FROM violations;
      DELETE FROM submissions;
      DELETE FROM chat;
      DELETE FROM progress;
      DELETE FROM members;
      DELETE FROM teams;
      UPDATE settings SET value = 'false' WHERE key IN ('clockPaused', 'gameStarted', 'allowNewTeams', 'leaderboardFrozen');
      UPDATE settings SET value = '0' WHERE key IN ('pauseStartedAt', 'eventStartedAt', 'totalPausedMs');
      UPDATE settings SET value = 'true' WHERE key = 'startTogetherMode';
    `);
  });

  tx();
  console.log('✅ SQLite tournament records, logs, and progress cleared.');
  console.log('🎉 Database wipe complete. System ready for tournament initial state.');
}

runSafeWipe().catch((err) => {
  console.error('❌ Wipe failed:', err);
  process.exit(1);
});
