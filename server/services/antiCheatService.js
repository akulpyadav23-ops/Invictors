// Anti-Cheat Service (Phase 4.7)
// Tracks visibility changes only (ignores blur); debounces 5s; 3s grace period; exempt during Stage 4

const { getRepositories } = require('../repositories');
const config = require('../config');
const clock = require('../lib/clock');

class AntiCheatService {
  constructor(repos = null) {
    this.repos = repos || getRepositories();
  }

  recordVisibilityChange(team, stage) {
    if (!config.TAB_PENALTY_ENABLED) {
      return { success: true, penaltyAdded: 0, totalPenaltyMin: team.penaltyMin };
    }

    // EXEMPTION: Stage 4 allows DevTools inspection for CTF reconnaissance (Phase 4.5 & 4.7)
    if (stage === 4) {
      return { success: true, penaltyAdded: 0, exempted: true, reason: 'Stage 4 CTF exemption' };
    }

    const now = clock.now();

    // 3s grace period after stage entry or team start
    const enteredAt = team.stage1EnteredAt || team.startedAt || now;
    if (now - enteredAt < 3000) {
      return { success: true, penaltyAdded: 0, exempted: true, reason: 'Grace period' };
    }

    // Debounce: reject if a violation was logged within 5 seconds
    const recentCount = this.repos.violations.getRecentCount(team.id, stage, now - 5000);
    if (recentCount > 0) {
      return { success: true, penaltyAdded: 0, debounced: true };
    }

    // Caps: max 3 per stage, 10 per team
    const stageViolations = this.repos.violations.getTotalForStage(team.id, stage);
    if (stageViolations >= 3) {
      return { success: true, penaltyAdded: 0, capped: true };
    }

    const teamViolations = team.tabSwitches || 0;
    if (teamViolations >= 10) {
      return { success: true, penaltyAdded: 0, capped: true };
    }

    const penaltyMin = config.TAB_PENALTY_MINUTES || 1;
    const newTotalSwitches = teamViolations + 1;
    const newTeamPenalty = (team.penaltyMin || 0) + penaltyMin;

    this.repos.transaction(() => {
      this.repos.violations.add({
        teamId: team.id,
        stage,
        type: 'visibilitychange',
        details: `Tab switch or window unfocused during Stage ${stage}`,
        penaltyAdded: penaltyMin,
        at: now
      });

      this.repos.teams.update(team.id, {
        tabSwitches: newTotalSwitches,
        penaltyMin: newTeamPenalty
      });
    })();

    return {
      success: true,
      tabSwitches: newTotalSwitches,
      penaltyAdded: penaltyMin,
      totalPenaltyMin: newTeamPenalty
    };
  }
}

module.exports = new AntiCheatService();
