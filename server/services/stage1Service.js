// Stage 1 Service: Signal Intercept & Morse Matrix (Two phases, server-authoritative) (Phase 4.2)

const { getMission } = require('../content/loader');
const clock = require('../lib/clock');

class Stage1Service {
  constructor(repos) {
    this.repos = repos;
    this.mission = getMission();
  }

  getStatePayload(team) {
    const stage1Config = this.mission.stages['1'];
    const now = clock.now();

    // Determine phase based on server time
    const memoriseDurationMs = (stage1Config.memoriseDurationSeconds || 60) * 1000;
    const enteredAt = team.stage1EnteredAt || team.startedAt || now;
    const opensAt = team.stage1OpensAt || enteredAt + memoriseDurationMs;

    const isMemorisePhase = now < opensAt;

    if (isMemorisePhase) {
      // Phase 1: MEMORISE
      // Return ONLY chart and instructions. Do NOT include sectors or answer data.
      return {
        phase: 'memorise',
        instruction: stage1Config.instruction,
        morseChart: stage1Config.morseChart,
        opensAt,
        serverNow: now,
        remainingSeconds: Math.max(0, Math.ceil((opensAt - now) / 1000))
      };
    }

    // Phase 2: SOLVE
    // Chart is hidden by default unless active chartVisibleUntil window is open
    const chartVisible = team.chartVisibleUntil && now < team.chartVisibleUntil;

    return {
      phase: 'solve',
      sectors: stage1Config.sectors,
      morseChart: chartVisible ? stage1Config.morseChart : null,
      chartVisibleUntil: chartVisible ? team.chartVisibleUntil : 0,
      serverNow: now
    };
  }

  validateSubmission(team, normalizedInput) {
    const stage1Config = this.mission.stages['1'];
    const now = clock.now();
    const opensAt = team.stage1OpensAt || team.stage1EnteredAt + 60000;

    // Reject submissions before memorise countdown ends
    if (now < opensAt) {
      throw {
        status: 400,
        message: 'Memorise phase in progress. The solve terminal opens once the 60-second countdown completes.'
      };
    }

    // Decoy rejection
    if (normalizedInput === stage1Config.decoy) {
      return { isCorrect: false, isDecoy: true };
    }

    const isCorrect = normalizedInput === stage1Config.answer;
    return {
      isCorrect,
      fragment: isCorrect ? stage1Config.answer : null
    };
  }
}

module.exports = Stage1Service;
