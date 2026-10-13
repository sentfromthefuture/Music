// Tiny request cache: TTL + in-flight de-duplication + stale-while-revalidate.
const entries = new Map(); // key -> { value, at, promise }

export function cached(key, ttlMs, fetcher, { force = false } = {}) {
  const e = entries.get(key);
  const now = Date.now();
  if (!force && e) {
    if (e.promise) return e.promise;
    if (now - e.at < ttlMs) return Promise.resolve(e.value);
  }
  const promise = Promise.resolve().then(fetcher).then((value) => {
    entries.set(key, { value, at: Date.now(), promise: null });
    return value;
  }, (err) => {
    // never cache failures; fall back to the stale value if there is one
    if (e && e.value !== undefined) { entries.set(key, { value: e.value, at: e.at, promise: null }); return e.value; }
    entries.delete(key);
    throw err;
  });
  entries.set(key, { value: e?.value, at: e?.at ?? 0, promise });
  return promise;
}

// Synchronous peek (for instant render from cache while a refresh runs).
export function peek(key) { return entries.get(key)?.value; }
export function isFresh(key, ttlMs) { const e = entries.get(key); return !!e && !e.promise && Date.now() - e.at < ttlMs; }
export function invalidate(prefix = '') {
  for (const k of [...entries.keys()]) if (k.startsWith(prefix)) entries.delete(k);
}
