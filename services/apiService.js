import Constants from 'expo-constants';
import CryptoJS from 'crypto-js';

// ─── Config ──────────────────────────────────────────────────────────────────

const debuggerHost = Constants.expoConfig?.hostUri || '';
const hostIP = debuggerHost.split(':')[0] || 'localhost';
const deployedApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || '';

// Pre-initialize secret key once — avoids repeated env lookup per call
const secretKey = process.env.EXPO_PUBLIC_API_KEY || 'cinestream_secret_secure_key_2026';

const normalizeBaseUrl = (value) => {
  if (!value) return '';
  return value.replace(/\/+$/, '');
};

const API_FALLBACKS = [
  deployedApiBaseUrl ? `${normalizeBaseUrl(deployedApiBaseUrl)}/api` : null,
  'https://cinestream-app-production-68d6.up.railway.app/api',
  `http://${hostIP}:8000/api`,
  `http://192.168.0.40:8000/api`,
  `http://10.0.2.2:8000/api`,
].filter(Boolean);

const preferredBaseUrl = API_FALLBACKS[0] || 'http://localhost:8000/api';
let activeBaseUrl = preferredBaseUrl;

// ─── URL Cooldown Tracker ─────────────────────────────────────────────────────

// Track failed URLs with cooldown (don't retry for 30 seconds)
const failedUrlCooldown = new Map(); // url -> timestamp when it failed
const COOLDOWN_MS = 30000; // 30 seconds

function isUrlOnCooldown(url) {
  const failedAt = failedUrlCooldown.get(url);
  if (!failedAt) return false;
  if (Date.now() - failedAt < COOLDOWN_MS) return true;
  failedUrlCooldown.delete(url); // cooldown expired
  return false;
}

function markUrlFailed(url) {
  failedUrlCooldown.set(url, Date.now());
}

// ─── In-Memory LRU Cache ──────────────────────────────────────────────────────

/**
 * Lightweight LRU cache with TTL.
 * Uses Map insertion-order to evict the oldest entry when at capacity.
 */
class LRUCache {
  constructor(capacity, ttlMs) {
    this.capacity = capacity;
    this.ttlMs = ttlMs;
    this.cache = new Map(); // key -> { value, expiresAt }
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    // Refresh insertion order (LRU touch)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.cache.size >= this.capacity && !this.cache.has(key)) {
      // Evict oldest (first) entry
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

// Cache instances — trending/search cached for 60s, details for 5 min
const trendingCache = new LRUCache(50, 60_000);
const searchCache   = new LRUCache(30, 60_000);
const detailsCache  = new LRUCache(100, 300_000);

// ─── Request Deduplicator ─────────────────────────────────────────────────────

/**
 * If the same endpoint is already in-flight, return the existing Promise
 * instead of firing a second network request.
 */
const inflightRequests = new Map(); // key -> Promise

function deduplicatedFetch(key, fetchFn) {
  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }
  const promise = fetchFn().finally(() => {
    inflightRequests.delete(key);
  });
  inflightRequests.set(key, promise);
  return promise;
}

// ─── Core Fetch Utilities ─────────────────────────────────────────────────────

const fetchWithTimeout = async (url, opts = {}, timeout = 15000) => {
  return Promise.race([
    fetch(url, opts),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]);
};

// Fast health check with reasonable timeout to accommodate cold starts
const checkHealth = async (baseUrl) => {
  if (isUrlOnCooldown(baseUrl)) return false;
  try {
    const res = await Promise.race([
      fetch(`${baseUrl}/health`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
    ]);
    if (res.ok) return true;
    markUrlFailed(baseUrl);
    return false;
  } catch (e) {
    markUrlFailed(baseUrl);
    return false;
  }
};

async function customFetch(endpoint, options = {}) {
  const timestamp = String(Date.now());
  const dataToSign = `/api${endpoint}${timestamp}`;
  const signature = CryptoJS.HmacSHA256(dataToSign, secretKey).toString(CryptoJS.enc.Hex);

  const headers = {
    ...(options.headers || {}),
    'X-Signature': signature,
    'X-Timestamp': timestamp
  };
  const optsWithHeaders = { ...options, headers };

  // 1. Try activeBaseUrl first (skip if on cooldown)
  if (!isUrlOnCooldown(activeBaseUrl)) {
    try {
      const response = await fetchWithTimeout(`${activeBaseUrl}${endpoint}`, optsWithHeaders, 15000);
      if (response.ok) return response;
      markUrlFailed(activeBaseUrl);
    } catch (err) {
      markUrlFailed(activeBaseUrl);
      console.log(`⚠️ ${activeBaseUrl} failed: ${err.message}`);
    }
  } else {
    console.log(`⏭️ Skipping ${activeBaseUrl} (on cooldown), scanning fallbacks...`);
  }

  // 2. Scan all fallbacks concurrently (skip ones on cooldown)
  const candidateUrls = API_FALLBACKS.filter(url => url !== activeBaseUrl && !isUrlOnCooldown(url));

  if (candidateUrls.length > 0) {
    const scanPromises = candidateUrls.map(async (url) => {
      const online = await checkHealth(url);
      if (online) return url;
      throw new Error('Offline');
    });

    try {
      const workingUrl = await Promise.any(scanPromises);
      activeBaseUrl = workingUrl;
      console.log(`🎯 Switched to: ${activeBaseUrl}`);
      const response = await fetchWithTimeout(`${activeBaseUrl}${endpoint}`, optsWithHeaders, 15000);
      if (response.ok) return response;
    } catch (_) {
      // All failed
    }
  }

  console.log('❌ All servers offline or on cooldown.');
  throw new Error('Network Error: All servers unavailable. Please check your connection.');
}

// ─── API Service ──────────────────────────────────────────────────────────────

export const apiService = {
  /**
   * Fetches the trending list with caching + request deduplication.
   */
  async getTrendingMedia(page = 0, filter = 'Latest', category = 'All') {
    const cacheKey = `trending:${page}:${filter}:${category}`;

    // Return cached value immediately if fresh
    const cached = trendingCache.get(cacheKey);
    if (cached) return cached;

    return deduplicatedFetch(cacheKey, async () => {
      const response = await customFetch(
        `/trending?page=${page}&filter=${encodeURIComponent(filter)}&category=${encodeURIComponent(category)}`
      );
      if (!response.ok) throw new Error('Backend failed to load trending list.');
      const data = await response.json();
      trendingCache.set(cacheKey, data);
      return data;
    });
  },

  /**
   * Searches with caching + request deduplication.
   */
  async searchMedia(query, page = 0) {
    const cacheKey = `search:${query}:${page}`;

    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    return deduplicatedFetch(cacheKey, async () => {
      const response = await customFetch(`/search?q=${encodeURIComponent(query)}&page=${page}`);
      if (!response.ok) throw new Error('Backend failed to search.');
      const data = await response.json();
      searchCache.set(cacheKey, data);
      return data;
    });
  },

  /**
   * Fetches media details with long-lived cache (5 min).
   */
  async getMediaDetails(id) {
    const cacheKey = `details:${id}`;

    const cached = detailsCache.get(cacheKey);
    if (cached) return cached;

    return deduplicatedFetch(cacheKey, async () => {
      const response = await customFetch(`/details/${id}`);
      if (!response.ok) throw new Error('Backend failed to load media details.');
      const data = await response.json();
      detailsCache.set(cacheKey, data);
      return data;
    });
  },

  /**
   * Resolves the direct video CDN stream source URL.
   * Stream URLs are session-specific — not cached.
   */
  async getStreamSources(id, season = 1, episode = 1, lang = 'Hindi') {
    try {
      const response = await customFetch(
        `/stream/${id}?season=${season}&episode=${episode}&lang=${encodeURIComponent(lang)}`
      );
      if (!response.ok) throw new Error('Backend failed to load stream sources.');
      return await response.json();
    } catch (e) {
      console.warn('Backend stream fetch failed:', e);
      throw e;
    }
  },

  /**
   * Fetches real download quality options for a media item.
   * Not cached — quality URLs are time-sensitive CDN tokens.
   */
  async getDownloadQualities(id, season = '', episode = '', lang = 'Hindi') {
    try {
      const response = await customFetch(
        `/download-qualities/${id}?season=${season}&episode=${episode}&lang=${encodeURIComponent(lang)}`
      );
      if (!response.ok) throw new Error('Backend failed to fetch download qualities.');
      return await response.json();
    } catch (e) {
      console.warn('Download qualities fetch failed:', e);
      throw e;
    }
  }
};
