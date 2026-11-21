// Injectable server clock for testing, pause tracking, and effective time computation (A14)

let mockTime = null;

const clock = {
  now() {
    if (mockTime !== null) {
      return mockTime;
    }
    return Date.now();
  },

  setMockTime(timeMs) {
    mockTime = timeMs;
  },

  advance(ms) {
    if (mockTime !== null) {
      mockTime += ms;
    }
  },

  resetMockTime() {
    mockTime = null;
  },

  // Compute team effective time in milliseconds (wall time - total paused time)
  computeEffectiveElapsedMs(team, nowMs = this.now()) {
    if (!team) return 0;
    const start = team.startedAt || nowMs;
    const end = team.finishedAt || nowMs;
    const paused = team.pausedMs || 0;
    const elapsed = end - start - paused;
    return Math.max(0, elapsed);
  },

  // Check if team has exceeded the time cap (A12)
  isTimeCapExceeded(team, timeCapMinutes, nowMs = this.now()) {
    if (!timeCapMinutes || timeCapMinutes <= 0) return false;
    const effectiveSec = Math.floor(this.computeEffectiveElapsedMs(team, nowMs) / 1000);
    return effectiveSec >= timeCapMinutes * 60;
  }
};

module.exports = clock;
