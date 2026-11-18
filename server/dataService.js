require('dotenv').config();
const crypto = require('crypto');
let sqliteDb = null;
try {
  sqliteDb = require('./db');
} catch (err) {
  console.warn('SQLite init warning:', err.message);
}

const isSupabaseConfigured = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
let supabase = null;

if (isSupabaseConfigured) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    // Use ws transport only when available (not needed on serverless/Vercel)
    let wsTransport;
    try { wsTransport = require('ws'); } catch (_) {}
    const supabaseOpts = { auth: { persistSession: false } };
    if (wsTransport) supabaseOpts.realtime = { transport: wsTransport };
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, supabaseOpts);
    console.log('⚡ Connected to Supabase Cloud Database:', process.env.SUPABASE_URL);
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
  }
} else {
  console.log('💾 Running with local SQLite database');
}

const dataService = {
  isSupabase() {
    return isSupabaseConfigured && supabase !== null;
  },

  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------
  async getSetting(key, defaultValue = null) {
    if (this.isSupabase()) {
      const { data, error } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
      if (error || !data) return defaultValue;
      return data.value;
    }
    const row = sqliteDb.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  },

  async getAllSettings() {
    if (this.isSupabase()) {
      const { data } = await supabase.from('settings').select('*');
      const map = {};
      (data || []).forEach(r => { map[r.key] = r.value; });
      return map;
    }
    const rows = sqliteDb.prepare('SELECT key, value FROM settings').all();
    const map = {};
    (rows || []).forEach(r => { map[r.key] = r.value; });
    return map;
  },

  async setSetting(key, value) {
    const valStr = String(value);
    if (this.isSupabase()) {
      const { error } = await supabase.from('settings').upsert({ key, value: valStr });
      if (error) console.error('Supabase setSetting error:', error);
      return !error;
    }
    sqliteDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, valStr);
    return true;
  },

  // --------------------------------------------------------------------------
  // Teams
  // --------------------------------------------------------------------------
  async getTeamByToken(token) {
    if (!token) return null;
    if (this.isSupabase()) {
      const { data } = await supabase.from('teams').select('*').eq('sessionToken', token).maybeSingle();
      return data || null;
    }
    return sqliteDb.prepare('SELECT * FROM teams WHERE sessionToken = ?').get(token) || null;
  },

  async getTeamById(id) {
    if (!id) return null;
    if (this.isSupabase()) {
      const { data } = await supabase.from('teams').select('*').eq('id', id).maybeSingle();
      return data || null;
    }
    return sqliteDb.prepare('SELECT * FROM teams WHERE id = ?').get(id) || null;
  },

  async getTeamByName(name) {
    if (!name) return null;
    if (this.isSupabase()) {
      const { data } = await supabase.from('teams').select('*').ilike('name', name.trim()).maybeSingle();
      return data || null;
    }
    return sqliteDb.prepare('SELECT * FROM teams WHERE name = ? COLLATE NOCASE').get(name.trim()) || null;
  },

  async getAllTeams() {
    if (this.isSupabase()) {
      const { data, error } = await supabase.from('teams').select('*').order('startedAt', { ascending: false });
      if (error) console.error('Supabase getAllTeams error:', error);
      return data || [];
    }
    return sqliteDb.prepare('SELECT * FROM teams ORDER BY startedAt DESC').all() || [];
  },

  async getWaitingTeamsCount() {
    if (this.isSupabase()) {
      const { count } = await supabase.from('teams').select('*', { count: 'exact', head: true }).eq('status', 'waiting');
      return count || 0;
    }
    const row = sqliteDb.prepare("SELECT COUNT(*) as c FROM teams WHERE status = 'waiting'").get();
    return row ? row.c : 0;
  },

  async createTeam({ team, members, stages = 6 }) {
    if (this.isSupabase()) {
      const { error: teamErr } = await supabase.from('teams').insert(team);
      if (teamErr) throw new Error(teamErr.message);

      if (members && members.length > 0) {
        const { error: memErr } = await supabase.from('members').insert(members);
        if (memErr) throw new Error(memErr.message);
      }

      const progressRows = [];
      for (let s = 1; s <= stages; s++) {
        progressRows.push({
          teamId: team.id,
          stage: s,
          fragment: null,
          wrongAttempts: 0,
          hintsUsed: 0,
          solvedAt: null
        });
      }
      const { error: progErr } = await supabase.from('progress').insert(progressRows);
      if (progErr) throw new Error(progErr.message);
      return team;
    }

    const tx = sqliteDb.transaction(() => {
      sqliteDb.prepare(`
        INSERT INTO teams (id, name, coordinator, startedAt, finishedAt, stage, penaltyMin, pausedMs, sessionToken, status, isPaused, teamPauseStartedAt, tabSwitches)
        VALUES (?, ?, ?, ?, NULL, 1, 0, 0, ?, ?, 0, 0, 0)
      `).run(team.id, team.name, team.coordinator, team.startedAt, team.sessionToken, team.status);

      const insMember = sqliteDb.prepare(`
        INSERT INTO members (id, teamId, fullName, isLeader, deviceToken)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const m of members) {
        insMember.run(m.id, m.teamId, m.fullName, m.isLeader, m.deviceToken || null);
      }

      const insProg = sqliteDb.prepare(`
        INSERT INTO progress (teamId, stage, fragment, wrongAttempts, hintsUsed, solvedAt)
        VALUES (?, ?, NULL, 0, 0, NULL)
      `);
      for (let s = 1; s <= stages; s++) {
        insProg.run(team.id, s);
      }
    });

    tx();
    return team;
  },

  async updateTeam(id, fields) {
    if (this.isSupabase()) {
      const { error } = await supabase.from('teams').update(fields).eq('id', id);
      if (error) console.error('Supabase updateTeam error:', error);
      return !error;
    }

    const keys = Object.keys(fields);
    if (keys.length === 0) return true;
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(id);
    sqliteDb.prepare(`UPDATE teams SET ${setClause} WHERE id = ?`).run(...values);
    return true;
  },

  async deleteTeam(id) {
    if (this.isSupabase()) {
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) console.error('Supabase deleteTeam error:', error);
      return !error;
    }
    sqliteDb.prepare('DELETE FROM teams WHERE id = ?').run(id);
    return true;
  },

  async addPausedMsToActiveTeams(duration) {
    if (duration <= 0) return true;
    if (this.isSupabase()) {
      const { data: activeTeams } = await supabase.from('teams').select('id, pausedMs').is('finishedAt', null);
      if (activeTeams && activeTeams.length > 0) {
        for (const t of activeTeams) {
          await supabase.from('teams').update({ pausedMs: (t.pausedMs || 0) + duration }).eq('id', t.id);
        }
      }
      return true;
    }
    sqliteDb.prepare('UPDATE teams SET pausedMs = pausedMs + ? WHERE finishedAt IS NULL').run(duration);
    return true;
  },

  async startAllTeams(now) {
    if (this.isSupabase()) {
      await this.setSetting('gameStarted', 'true');
      await this.setSetting('eventStartedAt', String(now));
      await this.setSetting('clockPaused', 'false');
      await this.setSetting('pauseStartedAt', '0');

      const { data, error } = await supabase
        .from('teams')
        .update({ status: 'active', startedAt: now })
        .eq('status', 'waiting')
        .select();

      if (error) console.error('Supabase startAllTeams error:', error);
      return data ? data.length : 0;
    }

    sqliteDb.prepare("UPDATE settings SET value = 'true' WHERE key = 'gameStarted'").run();
    sqliteDb.prepare("UPDATE settings SET value = ? WHERE key = 'eventStartedAt'").run(String(now));
    sqliteDb.prepare("UPDATE settings SET value = 'false' WHERE key = 'clockPaused'").run();
    sqliteDb.prepare("UPDATE settings SET value = '0' WHERE key = 'pauseStartedAt'").run();

    const res = sqliteDb.prepare("UPDATE teams SET status = 'active', startedAt = ? WHERE status = 'waiting'").run(now);
    return res.changes;
  },

  async restartAllTeams(mode, now) {
    const targetStatus = mode === 'active' ? 'active' : 'waiting';

    if (this.isSupabase()) {
      // Clear data
      await supabase.from('submissions').delete().neq('id', 0);
      await supabase.from('chat').delete().neq('id', 0);
      await supabase.from('violations').delete().neq('id', '0');
      await supabase.from('progress').delete().neq('stage', 0);

      // Get all teams
      const { data: teams } = await supabase.from('teams').select('id');
      if (teams && teams.length > 0) {
        const progRows = [];
        for (const t of teams) {
          for (let s = 1; s <= 6; s++) {
            progRows.push({
              teamId: t.id,
              stage: s,
              fragment: null,
              wrongAttempts: 0,
              hintsUsed: 0,
              solvedAt: null
            });
          }
        }
        await supabase.from('progress').insert(progRows);

        await supabase.from('teams').update({
          stage: 1,
          finishedAt: null,
          penaltyMin: 0,
          pausedMs: 0,
          isPaused: 0,
          teamPauseStartedAt: 0,
          tabSwitches: 0,
          startedAt: now,
          status: targetStatus
        }).neq('id', '0');
      }

      await this.setSetting('gameStarted', mode === 'active' ? 'true' : 'false');
      await this.setSetting('eventStartedAt', '0');
      await this.setSetting('totalPausedMs', '0');
      await this.setSetting('clockPaused', 'false');
      await this.setSetting('pauseStartedAt', '0');
      return true;
    }

    const tx = sqliteDb.transaction(() => {
      sqliteDb.prepare('DELETE FROM submissions').run();
      sqliteDb.prepare('DELETE FROM chat').run();
      sqliteDb.prepare('DELETE FROM violations').run();
      sqliteDb.prepare('DELETE FROM progress').run();

      const teams = sqliteDb.prepare('SELECT id FROM teams').all();
      const insertProg = sqliteDb.prepare('INSERT INTO progress (teamId, stage, fragment, wrongAttempts, hintsUsed, solvedAt) VALUES (?, ?, NULL, 0, 0, NULL)');
      for (const t of teams) {
        for (let s = 1; s <= 6; s++) {
          insertProg.run(t.id, s);
        }
      }

      sqliteDb.prepare(`
        UPDATE teams
        SET stage = 1,
            finishedAt = NULL,
            penaltyMin = 0,
            pausedMs = 0,
            isPaused = 0,
            teamPauseStartedAt = 0,
            tabSwitches = 0,
            startedAt = ?,
            status = ?
      `).run(now, targetStatus);

      sqliteDb.prepare("UPDATE settings SET value = ? WHERE key = 'gameStarted'").run(mode === 'active' ? 'true' : 'false');
      sqliteDb.prepare("UPDATE settings SET value = '0' WHERE key = 'eventStartedAt'").run();
      sqliteDb.prepare("UPDATE settings SET value = '0' WHERE key = 'totalPausedMs'").run();
      sqliteDb.prepare("UPDATE settings SET value = 'false' WHERE key = 'clockPaused'").run();
      sqliteDb.prepare("UPDATE settings SET value = '0' WHERE key = 'pauseStartedAt'").run();
    });

    tx();
    return true;
  },

  // --------------------------------------------------------------------------
  // Members
  // --------------------------------------------------------------------------
  async getMembers(teamId) {
    if (this.isSupabase()) {
      const { data } = await supabase.from('members').select('*').eq('teamId', teamId);
      return data || [];
    }
    return sqliteDb.prepare('SELECT * FROM members WHERE teamId = ?').all(teamId) || [];
  },

  async getMembersForTeams(teamIds) {
    if (!teamIds || teamIds.length === 0) return [];
    if (this.isSupabase()) {
      const { data } = await supabase.from('members').select('*').in('teamId', teamIds);
      return data || [];
    }
    const placeholders = teamIds.map(() => '?').join(',');
    return sqliteDb.prepare(`SELECT * FROM members WHERE teamId IN (${placeholders})`).all(...teamIds) || [];
  },

  async updateMember(id, fields) {
    if (this.isSupabase()) {
      const { error } = await supabase.from('members').update(fields).eq('id', id);
      return !error;
    }
    const keys = Object.keys(fields);
    if (keys.length === 0) return true;
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(id);
    sqliteDb.prepare(`UPDATE members SET ${setClause} WHERE id = ?`).run(...values);
    return true;
  },

  async resetMemberDevice(memberId) {
    return this.updateMember(memberId, { deviceToken: null });
  },

  async resetAllMemberDevices(teamId) {
    if (this.isSupabase()) {
      const { error } = await supabase.from('members').update({ deviceToken: null }).eq('teamId', teamId);
      return !error;
    }
    sqliteDb.prepare('UPDATE members SET deviceToken = NULL WHERE teamId = ?').run(teamId);
    return true;
  },

  // --------------------------------------------------------------------------
  // Progress
  // --------------------------------------------------------------------------
  async getProgress(teamId) {
    if (this.isSupabase()) {
      const { data } = await supabase.from('progress').select('*').eq('teamId', teamId).order('stage', { ascending: true });
      return data || [];
    }
    return sqliteDb.prepare('SELECT * FROM progress WHERE teamId = ? ORDER BY stage ASC').all(teamId) || [];
  },

  async getProgressForTeams(teamIds) {
    if (!teamIds || teamIds.length === 0) return [];
    if (this.isSupabase()) {
      const { data } = await supabase.from('progress').select('*').in('teamId', teamIds);
      return data || [];
    }
    const placeholders = teamIds.map(() => '?').join(',');
    return sqliteDb.prepare(`SELECT * FROM progress WHERE teamId IN (${placeholders})`).all(...teamIds) || [];
  },

  async updateProgress(teamId, stage, fields) {
    if (this.isSupabase()) {
      const { error } = await supabase.from('progress').update(fields).eq('teamId', teamId).eq('stage', stage);
      return !error;
    }
    const keys = Object.keys(fields);
    if (keys.length === 0) return true;
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(teamId, stage);
    sqliteDb.prepare(`UPDATE progress SET ${setClause} WHERE teamId = ? AND stage = ?`).run(...values);
    return true;
  },

  async resetTeamProgress(teamId, now) {
    if (this.isSupabase()) {
      await supabase.from('progress').delete().eq('teamId', teamId);
      const rows = [];
      for (let s = 1; s <= 6; s++) {
        rows.push({
          teamId,
          stage: s,
          fragment: null,
          wrongAttempts: 0,
          hintsUsed: 0,
          solvedAt: null
        });
      }
      await supabase.from('progress').insert(rows);

      await supabase.from('teams').update({
        stage: 1,
        finishedAt: null,
        penaltyMin: 0,
        pausedMs: 0,
        isPaused: 0,
        teamPauseStartedAt: 0,
        tabSwitches: 0,
        startedAt: now
      }).eq('id', teamId);

      await supabase.from('submissions').delete().eq('teamId', teamId);
      await supabase.from('chat').delete().eq('teamId', teamId);
      await supabase.from('violations').delete().eq('teamId', teamId);
      return true;
    }

    const tx = sqliteDb.transaction(() => {
      sqliteDb.prepare('DELETE FROM progress WHERE teamId = ?').run(teamId);
      const insertProg = sqliteDb.prepare('INSERT INTO progress (teamId, stage, fragment, wrongAttempts, hintsUsed, solvedAt) VALUES (?, ?, NULL, 0, 0, NULL)');
      for (let s = 1; s <= 6; s++) {
        insertProg.run(teamId, s);
      }

      sqliteDb.prepare(`
        UPDATE teams
        SET stage = 1,
            finishedAt = NULL,
            penaltyMin = 0,
            pausedMs = 0,
            isPaused = 0,
            teamPauseStartedAt = 0,
            tabSwitches = 0,
            startedAt = ?
        WHERE id = ?
      `).run(now, teamId);

      sqliteDb.prepare('DELETE FROM submissions WHERE teamId = ?').run(teamId);
      sqliteDb.prepare('DELETE FROM chat WHERE teamId = ?').run(teamId);
      sqliteDb.prepare('DELETE FROM violations WHERE teamId = ?').run(teamId);
    });

    tx();
    return true;
  },

  // --------------------------------------------------------------------------
  // Submissions
  // --------------------------------------------------------------------------
  async addSubmission({ teamId, stage, valueHash, ok, at }) {
    if (this.isSupabase()) {
      const { error } = await supabase.from('submissions').insert({
        teamId,
        stage,
        valueHash,
        ok,
        at
      });
      return !error;
    }
    sqliteDb.prepare('INSERT INTO submissions (teamId, stage, valueHash, ok, at) VALUES (?, ?, ?, ?, ?)').run(teamId, stage, valueHash, ok, at);
    return true;
  },

  // --------------------------------------------------------------------------
  // Chat
  // --------------------------------------------------------------------------
  async addChat({ teamId, role, text, at }) {
    if (this.isSupabase()) {
      const { error } = await supabase.from('chat').insert({ teamId, role, text, at });
      return !error;
    }
    sqliteDb.prepare('INSERT INTO chat (teamId, role, text, at) VALUES (?, ?, ?, ?)').run(teamId, role, text, at);
    return true;
  },

  async getChatHistory(teamId) {
    if (this.isSupabase()) {
      const { data } = await supabase.from('chat').select('role, text, at').eq('teamId', teamId).order('at', { ascending: true });
      return data || [];
    }
    return sqliteDb.prepare('SELECT role, text, at FROM chat WHERE teamId = ? ORDER BY at ASC').all(teamId) || [];
  },

  async getRecentChatCount(teamId, role, sinceTime) {
    if (this.isSupabase()) {
      const { count } = await supabase.from('chat').select('*', { count: 'exact', head: true })
        .eq('teamId', teamId)
        .eq('role', role)
        .gt('at', sinceTime);
      return count || 0;
    }
    const row = sqliteDb.prepare('SELECT COUNT(*) as count FROM chat WHERE teamId = ? AND role = ? AND at > ?').get(teamId, role, sinceTime);
    return row ? row.count : 0;
  },

  async getRecentWardenLogs(limit = 60) {
    if (this.isSupabase()) {
      const { data: logs } = await supabase.from('chat').select('id, teamId, role, text, at').order('at', { ascending: false }).limit(limit);
      if (!logs || logs.length === 0) return [];
      const teamIds = [...new Set(logs.map(l => l.teamId))];
      const { data: teams } = await supabase.from('teams').select('id, name').in('id', teamIds);
      const teamMap = {};
      (teams || []).forEach(t => { teamMap[t.id] = t.name; });
      return logs.map(l => ({
        ...l,
        teamName: teamMap[l.teamId] || 'Unknown'
      }));
    }

    return sqliteDb.prepare(`
      SELECT c.id, c.teamId, t.name as teamName, c.role, c.text, c.at
      FROM chat c
      JOIN teams t ON c.teamId = t.id
      ORDER BY c.at DESC
      LIMIT ?
    `).all(limit) || [];
  },

  // --------------------------------------------------------------------------
  // Violations (Anti-Cheat)
  // --------------------------------------------------------------------------
  async addViolation({ id, teamId, type, details, penaltyAdded, at }) {
    const vId = id || crypto.randomUUID();
    if (this.isSupabase()) {
      const { error } = await supabase.from('violations').insert({
        id: vId,
        teamId,
        type,
        details,
        penaltyAdded,
        at
      });
      return !error;
    }
    sqliteDb.prepare('INSERT INTO violations (id, teamId, type, details, penaltyAdded, at) VALUES (?, ?, ?, ?, ?, ?)').run(
      vId, teamId, type, details, penaltyAdded, at
    );
    return true;
  },

  async getViolations(limit = 50) {
    if (this.isSupabase()) {
      const { data: violations } = await supabase.from('violations').select('*').order('at', { ascending: false }).limit(limit);
      if (!violations || violations.length === 0) return [];
      const teamIds = [...new Set(violations.map(v => v.teamId))];
      const { data: teams } = await supabase.from('teams').select('id, name').in('id', teamIds);
      const teamMap = {};
      (teams || []).forEach(t => { teamMap[t.id] = t.name; });
      return violations.map(v => ({
        ...v,
        teamName: teamMap[v.teamId] || 'Unknown'
      }));
    }

    return sqliteDb.prepare(`
      SELECT v.id, v.teamId, t.name as teamName, v.type, v.details, v.penaltyAdded, v.at
      FROM violations v
      JOIN teams t ON v.teamId = t.id
      ORDER BY v.at DESC
      LIMIT ?
    `).all(limit) || [];
  },

  async deleteViolation(id) {
    if (this.isSupabase()) {
      const { error } = await supabase.from('violations').delete().eq('id', id);
      return !error;
    }
    sqliteDb.prepare('DELETE FROM violations WHERE id = ?').run(id);
    return true;
  }
};

module.exports = dataService;
