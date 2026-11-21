// Admin Service (Phase 6 / Operations, Exports, Session controls)

const crypto = require('crypto');
const { getRepositories } = require('../repositories');
const config = require('../config');
const clock = require('../lib/clock');
const cache = require('../lib/cache');
const { generateVerificationCode } = require('../lib/hmac');

class AdminService {
  constructor(repos = null) {
    this.repos = repos || getRepositories();
  }

  verifyPin(providedPin) {
    if (!providedPin) return false;
    const a = Buffer.from(String(providedPin).trim());
    const b = Buffer.from(String(config.ADMIN_PIN).trim());
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  // Global pause/resume
  toggleGlobalPause(pauseState, actor = 'admin') {
    const now = clock.now();
    const isPaused = pauseState === true;

    this.repos.transaction(() => {
      this.repos.settings.set('clockPaused', isPaused ? 'true' : 'false');
      if (isPaused) {
        this.repos.settings.set('pauseStartedAt', String(now));
      } else {
        const pauseStarted = parseInt(this.repos.settings.get('pauseStartedAt', '0'), 10) || now;
        const duration = Math.max(0, now - pauseStarted);
        this.repos.teams.addPausedMsToActive(duration);
        const prevTotal = parseInt(this.repos.settings.get('totalPausedMs', '0'), 10) || 0;
        this.repos.settings.set('totalPausedMs', String(prevTotal + duration));
        this.repos.settings.set('pauseStartedAt', '0');
      }
    })();

    cache.clear();
    return { isClockPaused: isPaused };
  }

  // Team pause/resume
  toggleTeamPause(teamId, action, actor = 'admin') {
    const team = this.repos.teams.getById(teamId);
    if (!team) throw { status: 404, message: 'Team not found' };

    const now = clock.now();
    if (action === 'pause') {
      this.repos.teams.update(teamId, { isPaused: 1, teamPauseStartedAt: now });
      return { isPaused: true };
    } else {
      const pauseStarted = team.teamPauseStartedAt || now;
      const duration = Math.max(0, now - pauseStarted);
      const newPausedMs = (team.pausedMs || 0) + duration;
      this.repos.teams.update(teamId, {
        isPaused: 0,
        teamPauseStartedAt: 0,
        pausedMs: newPausedMs
      });
      return { isPaused: false };
    }
  }

  // Reset team back to Stage 1
  resetTeamProgress(teamId, actor = 'admin') {
    const team = this.repos.teams.getById(teamId);
    if (!team) throw { status: 404, message: 'Team not found' };

    const now = clock.now();
    this.repos.transaction(() => {
      this.repos.progress.resetTeam(teamId, 5);
      this.repos.teams.update(teamId, {
        stage: 1,
        finishedAt: null,
        penaltyMin: 0,
        pausedMs: 0,
        isPaused: 0,
        teamPauseStartedAt: 0,
        tabSwitches: 0,
        startedAt: now,
        stage1EnteredAt: now,
        stage1OpensAt: now + 60000,
        chartVisibleUntil: 0
      });
    })();

    cache.clear();
    return { success: true };
  }

  // Generate CSV Export
  generateCsvExport() {
    const teams = this.repos.teams.getAll();
    const headers = [
      'Rank',
      'Team Name',
      'Coordinator',
      'Member Count',
      'Status',
      'Current Stage',
      'Total Time (s)',
      'Total Time (Formatted)',
      'Penalty (min)',
      'Hints Used',
      'Wrong Attempts',
      'Tab Violations',
      'Verification Code'
    ];

    const rows = [headers.join(',')];

    teams.forEach((t, idx) => {
      const progressList = this.repos.progress.getByTeamId(t.id);
      const totalHints = progressList.reduce((acc, p) => acc + (p.hintsUsed || 0), 0);
      const totalWrong = progressList.reduce((acc, p) => acc + (p.wrongAttempts || 0), 0);
      const effectiveSec = Math.floor(clock.computeEffectiveElapsedMs(t) / 1000);
      const totalSec = effectiveSec + (t.penaltyMin || 0) * 60;
      const formatted = `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`;
      const code = t.finishedAt ? generateVerificationCode(t.name, t.startedAt, t.finishedAt) : '';

      rows.push(
        [
          idx + 1,
          `"${t.name.replace(/"/g, '""')}"`,
          `"${(t.coordinator || '').replace(/"/g, '""')}"`,
          t.memberCount,
          t.status,
          t.finishedAt ? 'Completed' : t.stage,
          totalSec,
          `"${formatted}"`,
          t.penaltyMin || 0,
          totalHints,
          totalWrong,
          t.tabSwitches || 0,
          code
        ].join(',')
      );
    });

    return rows.join('\n');
  }
}

module.exports = AdminService;
