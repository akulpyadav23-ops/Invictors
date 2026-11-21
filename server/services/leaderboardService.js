// Leaderboard Service (Phase 6.3 / Ranking rules A13)
// Ranking order:
// 1. Finished teams above in-progress teams
// 2. Lower total time first: (finishedAt - startedAt - pausedMs) + penaltyMinutes*60
// 3. Ties broken by fewer hints used, then fewer wrong attempts
// 4. In-progress teams ranked by highest stage, then lowest elapsed time
// 5. Timed-out teams ranked below finished teams

const { getRepositories } = require('../repositories');
const cache = require('../lib/cache');
const clock = require('../lib/clock');

class LeaderboardService {
  constructor(repos = null) {
    this.repos = repos || getRepositories();
  }

  getStandings(isProjector = false) {
    const cacheKey = `leaderboard_${isProjector ? 'proj' : 'live'}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const isFrozen = this.repos.settings.get('leaderboardFrozen', 'false') === 'true';

    // If projector view and frozen, return cached frozen snapshot if available
    if (isProjector && isFrozen) {
      const frozenSnapshot = cache.get('leaderboard_frozen_snapshot');
      if (frozenSnapshot) return frozenSnapshot;
    }

    const teams = this.repos.teams.getAll();
    const teamIds = teams.map((t) => t.id);

    const allMembers = this.repos.members.getForTeams(teamIds);
    const allProgress = this.repos.progress.getForTeams(teamIds);

    const progressByTeam = {};
    allProgress.forEach((p) => {
      if (!progressByTeam[p.teamId]) progressByTeam[p.teamId] = [];
      progressByTeam[p.teamId].push(p);
    });

    const membersByTeam = {};
    allMembers.forEach((m) => {
      if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = [];
      membersByTeam[m.teamId].push(m);
    });

    const now = clock.now();

    const standings = teams.map((t) => {
      const prog = progressByTeam[t.id] || [];
      const totalHints = prog.reduce((acc, p) => acc + (p.hintsUsed || 0), 0);
      const totalWrong = prog.reduce((acc, p) => acc + (p.wrongAttempts || 0), 0);
      const effectiveMs = clock.computeEffectiveElapsedMs(t, now);
      const totalSeconds = Math.floor(effectiveMs / 1000) + (t.penaltyMin || 0) * 60;
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      const isFinished = !!t.finishedAt;
      const isTimeout = t.status === 'timeout';

      return {
        id: t.id,
        name: t.name,
        coordinator: t.coordinator,
        memberCount: t.memberCount || 3,
        stage: t.stage,
        stageText: isFinished ? 'Completed' : isTimeout ? 'Timed Out' : `Stage ${t.stage} of 6`,
        isFinished,
        isTimeout,
        status: t.status,
        totalSeconds,
        formattedTime,
        penaltyMin: t.penaltyMin || 0,
        totalHints,
        totalWrong,
        tabSwitches: t.tabSwitches || 0
      };
    });

    // Ranking algorithm per A13
    standings.sort((a, b) => {
      // 1. Finished vs non-finished
      if (a.isFinished && !b.isFinished) return -1;
      if (!a.isFinished && b.isFinished) return 1;

      // Both finished
      if (a.isFinished && b.isFinished) {
        if (a.totalSeconds !== b.totalSeconds) return a.totalSeconds - b.totalSeconds;
        if (a.totalHints !== b.totalHints) return a.totalHints - b.totalHints;
        return a.totalWrong - b.totalWrong;
      }

      // Timeout teams rank below in-progress teams
      if (!a.isTimeout && b.isTimeout) return -1;
      if (a.isTimeout && !b.isTimeout) return 1;

      // In-progress: highest stage first, then lowest elapsed time
      if (a.stage !== b.stage) return b.stage - a.stage;
      if (a.totalSeconds !== b.totalSeconds) return a.totalSeconds - b.totalSeconds;
      if (a.totalHints !== b.totalHints) return a.totalHints - b.totalHints;
      return a.totalWrong - b.totalWrong;
    });

    const result = {
      standings,
      isFrozen,
      serverTime: now
    };

    cache.set(cacheKey, result, 2); // 2-second cache
    if (isFrozen && !cache.get('leaderboard_frozen_snapshot')) {
      cache.set('leaderboard_frozen_snapshot', result, 3600);
    }

    return result;
  }
}

module.exports = LeaderboardService;
