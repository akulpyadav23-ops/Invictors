// Stage 2 Service: Decoding with deterministic seeded order (A4) and lowercase enforcement (A5)

const crypto = require('crypto');
const { getMission } = require('../content/loader');

class Stage2Service {
  constructor(repos) {
    this.repos = repos;
    this.mission = getMission();
  }

  // Generate deterministic order of fragments from team seed (A4)
  getDeterministicOrder(team) {
    if (team.stage2Order) {
      try {
        return JSON.parse(team.stage2Order);
      } catch (_) {}
    }

    // Generate deterministic permutation of [1, 2, 3, 4] or code fragments
    const baseItems = [1, 2, 3, 4];
    const seed = team.seed || 'default_seed';
    const hash = crypto.createHash('sha256').update(seed).digest();

    const order = [...baseItems];
    for (let i = order.length - 1; i > 0; i--) {
      const j = hash[i] % (i + 1);
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }

    try {
      this.repos.teams.update(team.id, { stage2Order: JSON.stringify(order) });
    } catch (_) {}

    return order;
  }

  getStatePayload(team) {
    const stage2Config = this.mission.stages['2'];
    const order = this.getDeterministicOrder(team);

    return {
      encodedText: stage2Config.encodedText,
      instruction: stage2Config.instruction,
      sequenceOrder: order
    };
  }

  // Answer validation per A5:
  // Players must type answer in lowercase.
  // Uppercase or mixed case returns "Enter your answer in lowercase" without wrong attempt or penalty!
  validateSubmission(team, rawInput) {
    const stage2Config = this.mission.stages['2'];
    const trimmed = (rawInput || '').trim();

    // Check case sensitivity rule (A5)
    const expectedLower = stage2Config.answer.toLowerCase();

    if (/[A-Z]/.test(trimmed)) {
      return {
        isCorrect: false,
        requiresLowercaseNotice: true,
        message: 'Enter your answer in lowercase'
      };
    }

    const isCorrect = trimmed === expectedLower;
    return {
      isCorrect,
      requiresLowercaseNotice: false,
      fragment: isCorrect ? stage2Config.answer.toUpperCase() : null
    };
  }
}

module.exports = Stage2Service;
