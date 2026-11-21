// Per-team async mutex lock map
// Ensures same-team requests serialize cleanly while different teams run concurrently in parallel.

class KeyedMutex {
  constructor(timeoutMs = 5000) {
    this.timeoutMs = timeoutMs;
    this.locks = new Map();
  }

  async acquire(key) {
    while (this.locks.has(key)) {
      const waitPromise = this.locks.get(key);
      try {
        await Promise.race([
          waitPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Lock acquisition timeout')), this.timeoutMs))
        ]);
      } catch {
        // If timed out, break loop and take over lock to prevent permanent deadlock
        break;
      }
    }

    let releaseFn;
    const lockPromise = new Promise((resolve) => {
      releaseFn = resolve;
    });

    this.locks.set(key, lockPromise);

    return () => {
      if (this.locks.get(key) === lockPromise) {
        this.locks.delete(key);
      }
      releaseFn();
    };
  }

  async withLock(key, fn) {
    const release = await this.acquire(key);
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

module.exports = new KeyedMutex();
