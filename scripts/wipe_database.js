require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
let sqliteDb = null;
try {
  sqliteDb = require('../server/db');
} catch (_) {}

async function wipe() {
  console.log('🧹 Starting complete dataset purge...');

  // 1. Wipe Supabase if configured
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    let wsTransport;
    try { wsTransport = require('ws'); } catch (_) {}
    const supabaseOpts = { auth: { persistSession: false } };
    if (wsTransport) supabaseOpts.realtime = { transport: wsTransport };
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, supabaseOpts);

    console.log('📡 Purging Supabase cloud database...');
    // Delete dependent tables first
    await supabase.from('submissions').delete().neq('id', 0);
    await supabase.from('chat').delete().neq('id', 0);
    await supabase.from('violations').delete().neq('id', '0');
    await supabase.from('progress').delete().neq('stage', 0);
    await supabase.from('members').delete().neq('id', '0');
    await supabase.from('teams').delete().neq('id', '0');

    // Reset settings
    const defaultSettings = [
      { key: 'clockPaused', value: 'false' },
      { key: 'pauseStartedAt', value: '0' },
      { key: 'allowNewTeams', value: 'false' },
      { key: 'eventStartedAt', value: '0' },
      { key: 'totalPausedMs', value: '0' },
      { key: 'startTogetherMode', value: 'true' },
      { key: 'gameStarted', value: 'false' },
      { key: 'winnersNotepad', value: '🏆 INVICTORS FINAL OVERRIDE — OFFICIAL WINNERS SCRATCHPAD\n=======================================================\n1st Place:\n2nd Place:\n3rd Place:\n\nSpecial Mentions:\nJudge Notes:\n' }
    ];

    for (const s of defaultSettings) {
      await supabase.from('settings').upsert(s, { onConflict: 'key' });
    }

    console.log('✅ Supabase cloud tables successfully cleared and settings reset.');
  }

  // 2. Wipe SQLite local if present
  if (sqliteDb) {
    try {
      console.log('💾 Purging local SQLite database...');
      sqliteDb.exec(`
        DELETE FROM submissions;
        DELETE FROM chat;
        DELETE FROM violations;
        DELETE FROM progress;
        DELETE FROM members;
        DELETE FROM teams;
        UPDATE settings SET value = 'false' WHERE key IN ('clockPaused', 'gameStarted', 'allowNewTeams');
        UPDATE settings SET value = '0' WHERE key IN ('pauseStartedAt', 'eventStartedAt', 'totalPausedMs');
        UPDATE settings SET value = 'true' WHERE key = 'startTogetherMode';
      `);
      console.log('✅ SQLite local tables successfully cleared.');
    } catch (e) {
      console.warn('SQLite purge note:', e.message);
    }
  }

  console.log('🎉 Full dataset purge completed! Ready for a fresh start.');
}

wipe().catch(err => {
  console.error('Purge error:', err);
  process.exit(1);
});
