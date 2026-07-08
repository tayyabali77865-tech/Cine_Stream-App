import Constants from 'expo-constants';
import CryptoJS from 'crypto-js';

const debuggerHost = Constants.expoConfig?.hostUri || '';
const hostIP = debuggerHost.split(':')[0] || 'localhost';

const API_FALLBACKS = [
  `http://${hostIP}:8000/api`,
  `http://${hostIP}:5173/api`,
  `http://192.168.0.40:8000/api`,
  `http://192.168.0.40:5173/api`,
  `http://localhost:8000/api`,
  `http://localhost:5173/api`,
  `http://10.0.2.2:8000/api`
];

let activeBaseUrl = API_FALLBACKS[0];

async function customFetch(endpoint, options = {}) {
  const timestamp = String(Date.now());
  const secretKey = 'cinestream_secret_secure_key_2026';
  const dataToSign = `/api${endpoint}${timestamp}`;
  const signature = CryptoJS.HmacSHA256(dataToSign, secretKey).toString(CryptoJS.enc.Hex);

  const headers = {
    ...(options.headers || {}),
    'X-Signature': signature,
    'X-Timestamp': timestamp
  };
  const optsWithHeaders = {
    ...options,
    headers
  };

  const fetchWithTimeout = async (url, opts = {}, timeout = 2500) => {
    return Promise.race([
      fetch(url, opts),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
    ]);
  };

  try {
    // 1. Optimistic fetch directly using activeBaseUrl
    const response = await fetchWithTimeout(`${activeBaseUrl}${endpoint}`, optsWithHeaders, 2500);
    if (response.ok) {
      return response;
    }
  } catch (err) {
    console.log(`⚠️ Active base ${activeBaseUrl} fetch failed: ${err.message}. Checking server status...`);
  }

  // 2. If fetch failed, define health check helper
  const checkHealth = async (baseUrl) => {
    try {
      const res = await Promise.race([
        fetch(`${baseUrl}/health`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1200))
      ]);
      return res.ok;
    } catch (e) {
      return false;
    }
  };

  // Check if currently configured base URL is still online
  const isOnline = await checkHealth(activeBaseUrl);
  if (isOnline) {
    try {
      return await fetchWithTimeout(`${activeBaseUrl}${endpoint}`, optsWithHeaders, 2500);
    } catch (err) {
      console.log(`⚠️ Active base retry failed: ${err.message}`);
    }
  }

  console.log(`⚠️ Active base ${activeBaseUrl} is confirmed offline. Finding working fallback server...`);

  // 3. Scan fallbacks using the fast health check
  for (const url of API_FALLBACKS) {
    if (url === activeBaseUrl) continue;
    const urlOnline = await checkHealth(url);
    if (urlOnline) {
      activeBaseUrl = url;
      console.log(`🎯 Auto-discovery success: Connected to API base URL: ${activeBaseUrl}`);
      try {
        return await fetchWithTimeout(`${activeBaseUrl}${endpoint}`, optsWithHeaders, 2500);
      } catch (err) {
        console.log(`⚠️ Fallback connection to ${url} failed: ${err.message}`);
      }
    }
  }

  // 4. Ultimate fallback
  return fetchWithTimeout(`${activeBaseUrl}${endpoint}`, optsWithHeaders, 2500);
}

export const apiService = {
  /**
   * Fetches the trending list dynamically from our backend scraper with pagination support
   */
  async getTrendingMedia(page = 0, filter = 'Latest', category = 'All') {
    const response = await customFetch(`/trending?page=${page}&filter=${encodeURIComponent(filter)}&category=${encodeURIComponent(category)}`);
    if (!response.ok) throw new Error('Backend failed to load trending list.');
    return await response.json();
  },

  /**
   * Searches the entire Netmirror database dynamically via our backend search endpoint with pagination support
   */
  async searchMedia(query, page = 0) {
    const response = await customFetch(`/search?q=${encodeURIComponent(query)}&page=${page}`);
    if (!response.ok) throw new Error('Backend failed to search.');
    return await response.json();
  },

  /**
   * Fetches metadata details dynamically from our backend scraper
   */
  async getMediaDetails(id) {
    const response = await customFetch(`/details/${id}`);
    if (!response.ok) throw new Error('Backend failed to load media details.');
    return await response.json();
  },

  /**
   * Resolves the direct video CDN stream source URL dynamically with season/episode and language parameters
   */
  async getStreamSources(id, season = 1, episode = 1, lang = 'Hindi') {
    try {
      const response = await customFetch(`/stream/${id}?season=${season}&episode=${episode}&lang=${encodeURIComponent(lang)}`);
      if (!response.ok) throw new Error('Backend failed to load stream sources.');
      return await response.json();
    } catch (e) {
      console.warn('Backend stream fetch failed:', e);
      throw e;
    }
  }
};
