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

// ─── Netmirror Mirrors Manager (Client-side bypass) ───────────────────────────
let activeNetmirrorMirror = 'https://api2.imdb3.shop/api';
let allNetmirrorMirrors = ['https://api2.imdb3.shop/api', 'https://api2.imdb4.shop/api'];
let mirrorsFetched = false;

async function ensureNetmirrorMirrors() {
  if (mirrorsFetched) return;
  try {
    const res = await customFetch('/mirrors');
    if (res.ok) {
      const data = await res.json();
      if (data.activeMirror) {
        activeNetmirrorMirror = data.activeMirror;
        allNetmirrorMirrors = data.mirrors || [data.activeMirror];
        mirrorsFetched = true;
        console.log(`🌐 Loaded active netmirror mirror: ${activeNetmirrorMirror}`);
      }
    }
  } catch (err) {
    console.warn('⚠️ Failed to load netmirror mirrors from backend, using fallbacks:', err.message);
  }
}

// Start fetching mirrors in the background immediately
ensureNetmirrorMirrors().catch(() => {});

// ─── URL Cooldown Tracker ─────────────────────────────────────────────────────

// Track failed URLs with cooldown (don't retry for 6 seconds)
const failedUrlCooldown = new Map(); // url -> timestamp when it failed
const COOLDOWN_MS = 6000; // 6 seconds

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
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000)) // 10 seconds timeout
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
  const decodedEndpoint = decodeURIComponent(endpoint.replace(/\+/g, ' '));
  const dataToSign = `/api${decodedEndpoint}${timestamp}`;
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
      // If the server responded, it is active. Return response directly (even if 4xx)
      if (response.ok || response.status < 500) {
        return response;
      }
      // Only mark as failed if it returned a 5xx crash error
      markUrlFailed(activeBaseUrl);
    } catch (err) {
      markUrlFailed(activeBaseUrl);
      console.log(`⚠️ ${activeBaseUrl} failed: ${err.message}`);
    }
  } else {
    console.log(`⏭️ Skipping ${activeBaseUrl} (on cooldown), scanning fallbacks...`);
  }

  // 2. Scan all fallbacks concurrently (skip ones on cooldown)
  let candidateUrls = API_FALLBACKS.filter(url => url !== activeBaseUrl && !isUrlOnCooldown(url));

  // Safety Bypass: If ALL URLs are on cooldown, clear cooldowns and check them again
  if (candidateUrls.length === 0) {
    console.log('🔄 All servers on cooldown. Resetting cooldowns for retry.');
    failedUrlCooldown.clear();
    candidateUrls = API_FALLBACKS;
  }

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
      if (response.ok || response.status < 500) return response;
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
      const decodedQuery = decodeURIComponent(query);
      const formattedQuery = encodeURIComponent(decodedQuery.trim()).replace(/%20/g, '+');

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://netmirror.center/',
        'Origin': 'https://netmirror.center'
      };

      // Query all mirrors in parallel to get instant results
      const promises = allNetmirrorMirrors.map(async (mirror) => {
        const url = `${mirror}/search2/${formattedQuery}?page=${page}`;
        try {
          const response = await fetchWithTimeout(url, { headers }, 6000);
          if (!response.ok) return [];
          const rawData = await response.json();
          if (rawData.message && rawData.message.includes('Access denied')) return [];
          return rawData.results || [];
        } catch (err) {
          console.warn(`⚠️ Client Search parallel query failed on ${mirror}: ${err.message}`);
          return [];
        }
      });

      const allResultsArray = await Promise.all(promises);

      // Merge and deduplicate results by media ID
      const mergedResults = [];
      const seenIds = new Set();
      for (const results of allResultsArray) {
        for (const item of results) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            mergedResults.push(item);
          }
        }
      }

      const mediaList = mergedResults.map(item => ({
        id: item.id,
        title: item.title ? item.title.trim() : 'Unknown Title',
        poster: item.backdrop_path || 'https://placehold.co/300x450',
        type: item.media_type === 'tv' ? 'TV Show' : 'Movie',
        releaseDate: item.release_date || 'N/A',
        country: item.cn || '',
        channel: item.channel || '',
        rating: parseFloat(item.vote_average) || 0
      }));

      searchCache.set(cacheKey, mediaList);
      return mediaList;
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
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://netmirror.center/',
        'Origin': 'https://netmirror.center'
      };

      // Query all mirrors in parallel, first successful response wins
      const promises = allNetmirrorMirrors.map(async (mirror) => {
        const url = `${mirror}/movie/${id}`;
        const response = await fetchWithTimeout(url, { headers }, 6000);
        if (!response.ok) throw new Error(`HTTP status ${response.status}`);
        const data = await response.json();
        if (data.message && data.message.includes('Access denied')) {
          throw new Error('Blocked by Imunify360');
        }
        const results = data.results || [];
        if (results.length === 0) throw new Error('Details empty');
        
        // Track the working mirror
        activeNetmirrorMirror = mirror;
        return results[0];
      });

      try {
        const item = await Promise.any(promises);

        const alternateDubs = [];
        const titleStr = item.title ? String(item.title) : 'Unknown Title';
        const titleLower = titleStr.toLowerCase();
        if (titleLower.includes('hindi')) alternateDubs.push('Hindi');
        if (titleLower.includes('english')) alternateDubs.push('English');
        if (titleLower.includes('tamil')) alternateDubs.push('Tamil');
        if (titleLower.includes('telugu')) alternateDubs.push('Telugu');
        if (alternateDubs.length === 0) alternateDubs.push('Original');

        const hasValidSeasons = Array.isArray(item.season) && item.season.length > 0 && item.season.some(s => s && s.se > 0);
        const mediaType = hasValidSeasons ? 'TV Show' : 'Movie';
        const seasonsList = hasValidSeasons ? item.season : null;

        const detailsData = {
          id: item.id,
          title: item.title ? item.title.trim() : 'Unknown Title',
          description: item.dis || 'No description available.',
          poster: item.backdrop_path || 'https://placehold.co/300x450',
          type: mediaType,
          seasons: seasonsList,
          audioLanguages: alternateDubs,
          trailer: item.trailer || null,
          _rawItem: item
        };

        detailsCache.set(cacheKey, detailsData);
        return detailsData;
      } catch (err) {
        throw new Error('Failed to retrieve movie details from any mirror.');
      }
    });
  },

  /**
   * Resolves the direct video CDN stream source URL.
   * Stream URLs are session-specific — not cached.
   */
  async getStreamSources(id, season = 1, episode = 1, lang = 'Hindi') {
    try {
      // Get raw item details to pass to backend
      let details = detailsCache.get(`details:${id}`);
      if (!details) {
        details = await this.getMediaDetails(id);
      }
      const rawItem = details ? details._rawItem : null;

      const response = await customFetch(
        `/stream/${id}?season=${season}&episode=${episode}&lang=${encodeURIComponent(lang)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: rawItem })
        }
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
      // Get raw item details to pass to backend
      let details = detailsCache.get(`details:${id}`);
      if (!details) {
        details = await this.getMediaDetails(id);
      }
      const rawItem = details ? details._rawItem : null;

      const response = await customFetch(
        `/download-qualities/${id}?season=${season}&episode=${episode}&lang=${encodeURIComponent(lang)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: rawItem })
        }
      );
      if (!response.ok) throw new Error('Backend failed to fetch download qualities.');
      return await response.json();
    } catch (e) {
      console.warn('Download qualities fetch failed:', e);
      throw e;
    }
  },

  /**
   * Reports a playback error to the backend server to add it to the admin panel.
   */
  async reportPlaybackError(id, title, type, season = '', episode = '') {
    try {
      const response = await customFetch('/report-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: String(id),
          title: title || 'Unknown Title',
          type: type || 'Movie',
          season: season ? String(season) : '',
          episode: episode ? String(episode) : ''
        })
      });
      return response.ok;
    } catch (e) {
      console.warn('Playback error report failed:', e);
      return false;
    }
  }
};
