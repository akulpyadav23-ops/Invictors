// Token bucket & sliding window rate limiter with Retry-After headers

class RateLimiter {
  constructor() {
    // Key -> array of timestamps
    this.hits = new Map();
  }

  // Check if request is allowed. Returns { allowed: boolean, retryAfterSec: number }
  consume(key, maxRequests, windowMs) {
    if (process.env.NODE_ENV === 'test' && !process.env.TEST_RATE_LIMIT) {
      return { allowed: true, retryAfterSec: 0 };
    }
    const now = Date.now();
    let timestamps = this.hits.get(key) || [];

    // Filter hits within window
    timestamps = timestamps.filter(t => now - t < windowMs);

    if (timestamps.length >= maxRequests) {
      const oldest = timestamps[0];
      const retryAfterMs = Math.max(100, windowMs - (now - oldest));
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);
      return { allowed: false, retryAfterSec };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return { allowed: true, retryAfterSec: 0 };
  }

  reset(key) {
    this.hits.delete(key);
  }

  // Periodic cleanup
  prune(maxAgeMs = 3600000) {
    const now = Date.now();
    for (const [key, list] of this.hits.entries()) {
      const active = list.filter(t => now - t < maxAgeMs);
      if (active.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, active);
      }
    }
  }
}

const limiter = new RateLimiter();
const pruneTimer = setInterval(() => limiter.prune(), 300000); // Prune every 5 minutes
if (pruneTimer.unref) pruneTimer.unref();

module.exports = limiter;
