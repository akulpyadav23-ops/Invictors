// Central Hint Service (Phase 5 / Assumption A11)
// Manages central database-backed hints, server-enforced countdowns, penalties, and admin edits.

const { getRepositories } = require('../repositories');
const clock = require('../lib/clock');
const cache = require('../lib/cache');

class HintService {
  constructor(repos = null) {
    this.repos = repos || getRepositories();
  }

  // Get active revealed hints for team's current stage with server-enforced visibility windows
  getActiveHintsForStage(team, stage) {
    const usageList = this.repos.hints.getUsageByTeamAndStage(team.id, stage);
    const now = clock.now();

    return usageList.map((u) => {
      const isVisible = now < u.hintVisibleUntil;
      const hintDef = this.repos.hints.getById(u.hintId);

      return {
        hintNumber: u.hintNumber,
        category: hintDef ? hintDef.category : 'nudge',
        text: isVisible ? (hintDef ? hintDef.text : '') : null,
        durationSeconds: hintDef ? hintDef.durationSeconds : 30,
        penaltyMinutes: u.penaltyCharged,
        hintShownAt: u.hintShownAt,
        hintVisibleUntil: u.hintVisibleUntil,
        remainingSeconds: Math.max(0, Math.ceil((u.hintVisibleUntil - now) / 1000)),
        isExpired: !isVisible
      };
    });
  }

  // Request next hint for stage
  async requestHint(team, stage, idempotencyKey = null) {
    // Check pause
    if (team.isPaused === 1) {
      throw { status: 400, message: 'Mission is paused. Hints cannot be requested while paused.' };
    }

    const availableHints = this.repos.hints.getByStage(stage);
    if (!availableHints || availableHints.length === 0) {
      throw { status: 400, message: 'No hints configured for this stage.' };
    }

    const usageList = this.repos.hints.getUsageByTeamAndStage(team.id, stage);
    const nextHintNumber = usageList.length + 1;

    // Cap: max 2 hints per stage (A11)
    if (nextHintNumber > 2 || nextHintNumber > availableHints.length) {
      throw { status: 400, message: 'All hints for this stage have already been utilized.' };
    }

    const hintDef = availableHints.find((h) => h.hintNumber === nextHintNumber) || availableHints[nextHintNumber - 1];
    if (!hintDef || !hintDef.enabled) {
      throw { status: 400, message: 'Requested hint is currently disabled by organizers.' };
    }

    const now = clock.now();
    const durationMs = (hintDef.durationSeconds || 30) * 1000;
    const penaltyMin = hintDef.penaltyMinutes || (nextHintNumber === 1 ? 3 : 5);
    const visibleUntil = now + durationMs;

    let updatedPenalty = team.penaltyMin || 0;

    const tx = this.repos.transaction(() => {
      // Record usage (idempotent via unique constraint)
      this.repos.hints.recordUsage({
        teamId: team.id,
        stage,
        hintNumber: nextHintNumber,
        hintId: hintDef.id,
        penaltyCharged: penaltyMin,
        hintShownAt: now,
        hintVisibleUntil: visibleUntil,
        idempotencyKey
      });

      // Update team progress and penalty
      updatedPenalty = (team.penaltyMin || 0) + penaltyMin;
      this.repos.teams.update(team.id, { penaltyMin: updatedPenalty });
      this.repos.progress.update(team.id, stage, { hintsUsed: nextHintNumber });

      // If Stage 1, update chartVisibleUntil
      if (stage === 1) {
        this.repos.teams.update(team.id, { chartVisibleUntil: visibleUntil });
      }
    });

    tx();
    cache.invalidatePrefix('leaderboard');

    return {
      success: true,
      hintNumber: nextHintNumber,
      category: hintDef.category,
      text: hintDef.text,
      durationSeconds: hintDef.durationSeconds,
      penaltyAdded: penaltyMin,
      penaltyMinutes: penaltyMin,
      totalPenaltyMin: updatedPenalty,
      hintVisibleUntil: visibleUntil
    };
  }

  // Admin operations on hints
  getAllHintsForAdmin() {
    return this.repos.hints.getAll();
  }

  updateHintByAdmin(id, fields, actor = 'admin') {
    const existing = this.repos.hints.getById(id);
    if (!existing) throw { status: 404, message: 'Hint not found' };

    const cleanFields = {};
    if (fields.text !== undefined) cleanFields.text = String(fields.text).trim().slice(0, 500);
    if (fields.durationSeconds !== undefined)
      cleanFields.durationSeconds = Math.max(10, Math.min(300, parseInt(fields.durationSeconds, 10) || 30));
    if (fields.penaltyMinutes !== undefined)
      cleanFields.penaltyMinutes = Math.max(0, Math.min(60, parseInt(fields.penaltyMinutes, 10) || 3));
    if (fields.enabled !== undefined) cleanFields.enabled = fields.enabled ? 1 : 0;
    if (fields.category !== undefined) cleanFields.category = String(fields.category).trim();

    this.repos.hints.update(id, cleanFields);

    this.repos.audit.log({
      actor,
      action: 'update_hint',
      targetId: id,
      oldValue: existing,
      newValue: cleanFields
    });

    return this.repos.hints.getById(id);
  }
}

module.exports = HintService;
