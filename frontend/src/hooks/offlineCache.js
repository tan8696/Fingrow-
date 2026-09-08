/**
 * offlineCache — lightweight localStorage caching utility with TTL.
 * Ensures critical data is available even when the user is offline.
 */

const CACHE_PREFIX = 'fingrow_cache_';
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Store data in localStorage with a timestamp.
 * @param {string} key — cache key (will be prefixed)
 * @param {any} data — JSON-serialisable data
 * @param {number} ttlMs — time-to-live in ms (default 30 min)
 */
export function cacheData(key, data, ttlMs = DEFAULT_TTL_MS) {
  try {
    const entry = {
      data,
      ts: Date.now(),
      ttl: ttlMs,
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch (e) {
    // localStorage full or unavailable — silently skip
    console.warn('offlineCache: write failed for', key, e);
  }
}

/**
 * Retrieve cached data. Returns `null` if expired or missing.
 * @param {string} key — cache key
 * @param {boolean} ignoreExpiry — if true, return even expired data (useful for offline fallback)
 * @returns {{ data: any, fresh: boolean } | null}
 */
export function getCachedData(key, ignoreExpiry = false) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    const age = Date.now() - entry.ts;
    const fresh = age < (entry.ttl || DEFAULT_TTL_MS);
    if (!fresh && !ignoreExpiry) return null;
    return { data: entry.data, fresh };
  } catch {
    return null;
  }
}

/**
 * Remove a specific cached entry.
 */
export function clearCachedData(key) {
  try {
    localStorage.removeItem(CACHE_PREFIX + key);
  } catch {}
}

/**
 * Clear all FinGrow cache entries.
 */
export function clearAllCache() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch {}
}

// Predefined cache keys used by the app
export const CACHE_KEYS = {
  WEATHER: 'weather',
  LOAN_HISTORY: 'loan_history',
  PORTFOLIO: 'portfolio',
  MARKET_PRICES: 'market_prices',
  LAST_REPORT: 'last_report',
  HARVEST: 'harvest',
  CLUSTER: 'cluster',
};

/**
 * Wraps an async fetcher function with offline-cache awareness.
 * On success → caches the data and returns it.
 * On failure → returns cached data (even expired) with `cached: true` flag.
 *
 * @param {string} cacheKey
 * @param {Function} fetchFn — async function that returns data
 * @param {number} ttlMs — cache TTL
 * @returns {Promise<{ data: any, cached: boolean }>}
 */
export async function fetchWithCache(cacheKey, fetchFn, ttlMs = DEFAULT_TTL_MS) {
  try {
    const data = await fetchFn();
    cacheData(cacheKey, data, ttlMs);
    return { ...data, _cached: false };
  } catch (err) {
    // Network failure — try offline cache
    const cached = getCachedData(cacheKey, true); // allow expired
    if (cached) {
      return { ...cached.data, _cached: true, _cacheAge: Date.now() - (cached.ts || 0) };
    }
    throw err; // no cache either — propagate error
  }
}
