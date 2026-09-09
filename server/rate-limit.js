export function createRateLimiter({ windowMs = 60_000, max = 10 } = {}) {
  const hits = new Map();

  return function isAllowed(ip = 'unknown') {
    const now = Date.now();
    const key = typeof ip === 'string' && ip ? ip : 'unknown';
    const timestamps = (hits.get(key) || []).filter(timestamp => now - timestamp < windowMs);

    if (timestamps.length >= max) {
      hits.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    return true;
  };
}
