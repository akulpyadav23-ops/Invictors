// Idempotency key tracking (D: Reliability and error handling)
// Repeated submissions with the same key return the prior result without charging again

class IdempotencyStore {
  constructor(ttlMs = 600000) { // 10 minutes
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  get(key) {
    if (!key) return null;
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.response;
  }

  set(key, response) {
    if (!key) return;
    this.store.set(key, {
      response,
      expiresAt: Date.now() + this.ttlMs
    });
  }

  prune() {
    const now = Date.now();
    for (const [k, v] of this.store.entries()) {
      if (now > v.expiresAt) {
        this.store.delete(k);
      }
    }
  }
}

const idempotency = new IdempotencyStore();
const pruneTimer = setInterval(() => idempotency.prune(), 300000);
if (pruneTimer.unref) pruneTimer.unref();

module.exports = idempotency;
