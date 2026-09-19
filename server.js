require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const http = require('http');
const https = require('https');
axios.defaults.httpAgent = new http.Agent({ keepAlive: true });
axios.defaults.httpsAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });
const cheerio = require('cheerio');
const crypto = require('crypto');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const {
  DynamicMirrorManager,
  CircuitBreaker,
  RequestDeduplicator,
  LRUCacheWithSWR
} = require('./services/cacheService');
const db = require('./services/mongoService');
const ScraperService = require('./services/scraperService');

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Railway)
const PORT = process.env.PORT || 8000;
const defaultMirrors = (process.env.DEFAULT_API_DOMAINS || '').split(',');
const netmirrorHomeUrl = process.env.NETMIRROR_HOME_URL || 'https://netmirror.global/';

// Initializations
const mirrorManager = new DynamicMirrorManager({
  defaultMirrors,
  netmirrorHomeUrl,
  checkIntervalMs: 300000 // 5 minutes
});

const circuitBreaker = new CircuitBreaker({
  threshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '20'),
  resetMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_MS || '30000')
});

const deduplicator = new RequestDeduplicator();

// Caches Setup
const catalogCache = new LRUCacheWithSWR({
  capacity: parseInt(process.env.CACHE_CATALOG_CAPACITY || '200'),
  ttlMs: parseInt(process.env.CACHE_CATALOG_TTL_MS || '60000'),
  swrMs: parseInt(process.env.CACHE_CATALOG_SWR_MS || '300000'),
  fetchFn: async (key) => {
    // key is the path endpoint, e.g. "/movies/filter?..."
    return fetchFromNetmirrorWithRetry(key);
  }
});

const detailsCache = new LRUCacheWithSWR({
  capacity: parseInt(process.env.CACHE_DETAILS_CAPACITY || '500'),
  ttlMs: parseInt(process.env.CACHE_DETAILS_TTL_MS || '300000'),
  swrMs: parseInt(process.env.CACHE_DETAILS_SWR_MS || '900000'),
  allowFallbackOnError: false,
  fetchFn: async (key) => {
    return fetchFromNetmirrorWithRetry(key);
  }
});

// ─── Search Cache ─────────────────────────────────────────────────────────────
const searchCache = new LRUCacheWithSWR({
  capacity: parseInt(process.env.CACHE_SEARCH_CAPACITY || '100'),
  ttlMs: parseInt(process.env.CACHE_SEARCH_TTL_MS || '120000'),
  swrMs: parseInt(process.env.CACHE_SEARCH_SWR_MS || '300000'),
  fetchFn: async (key) => {
    return fetchFromNetmirrorWithRetry(key);
  }
});

// ─── Stream Cache ─────────────────────────────────────────────────────────────
const streamCache = new LRUCacheWithSWR({
  capacity: parseInt(process.env.CACHE_STREAM_CAPACITY || '50'),
  ttlMs: parseInt(process.env.CACHE_STREAM_TTL_MS || '0'), // Disabled by default because stream URLs are session-specific and expire quickly
  swrMs: parseInt(process.env.CACHE_STREAM_SWR_MS || '0'),
  fetchFn: async (key) => {
    // Stream cache ke liye fetchFn use nahi hoti — manually set karte hain
    return null;
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(cors({
  origin: '*', // Adjust production CORS rules if needed
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Signature', 'X-Timestamp']
}));
app.use(express.json());

// Trust proxy for rate limiting behind Railway/Vercel
app.set('trust proxy', 1);

// Rate Limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 mins
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api/', limiter);

// Structured Request Log Middleware
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  req.startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    console.log(JSON.stringify({
      requestId: req.id,
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      memoryUsageMb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
      activeMirror: mirrorManager.getActiveMirror()
    }));
  });
  next();
});

// HMAC Request Signature Authentication Middleware (Protecting only backend api endpoints)
app.use((req, res, next) => {
  const urlClean = req.originalUrl.split('?')[0];

  // Only protect API routes. Static web assets/web app routes are fully public.
  if (!urlClean.startsWith('/api/')) {
    return next();
  }

  // Exempt health check API endpoint
  if (urlClean === '/api/health') {
    return next();
  }

  // Exempt ad-config endpoint — must be public so old app versions can fetch it
  if (urlClean === '/api/ad-config') {
    return next();
  }

  // Exempt admin routes for manual testing
  if (urlClean.startsWith('/api/admin')) {
    return next();
  }

  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];

  if (!signature || !timestamp) {
    return res.status(401).json({ error: 'Unauthorized: Missing signature or timestamp.' });
  }

  // 1. Verify timestamp is fresh (Bypassed for emulator testing)
  // const now = Date.now();
  // const reqTime = parseInt(timestamp, 10);
  // if (isNaN(reqTime) || Math.abs(now - reqTime) > 60000) {
  //   return res.status(403).json({ error: 'Forbidden: Request has expired or clock is out of sync.' });
  // }

  // 2. Re-calculate signature
  const secretKey = process.env.API_KEY || 'cinestream_secret_secure_key_2026';
  const decodedUrl = decodeURIComponent(req.originalUrl.replace(/\+/g, ' '));
  const dataToSign = decodedUrl + timestamp;
  const expectedSignature = crypto.createHmac('sha256', secretKey).update(dataToSign).digest('hex');


  if (signature !== expectedSignature) {
    return res.status(403).json({ error: 'Forbidden: Invalid API signature.' });
  }

  next();
});

const REFERER_URL = 'https://netmirror.center/';
const HM_SECRET = 'net###@@sss';

const getHeaders = (referer = REFERER_URL, clientIp = null) => {
  const hdrs = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': referer,
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  };
  if (clientIp) {
    hdrs['X-Forwarded-For'] = clientIp;
    hdrs['X-Real-IP'] = clientIp;
    hdrs['Client-IP'] = clientIp;
  }
  return hdrs;
};

async function isDeleted(id) {
  return db.isDeleted(id);
}

/**
 * Resilient API Fetch wrapper with Deduplication, Retries, Circuit Breaker, and Failover
 */
async function fetchFromNetmirrorWithRetry(endpoint) {
  const maxRetries = parseInt(process.env.MAX_RETRIES || '3');

  return deduplicator.execute(endpoint, async () => {
    if (!circuitBreaker.allow()) {
      throw new Error('Circuit breaker is open. Request to NetMirror blocked.');
    }

    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const activeMirror = mirrorManager.getActiveMirror();
      const url = `${activeMirror}${endpoint}`;

      try {
        console.log(`[Fetcher] Sending request to NetMirror: ${url} (Attempt ${attempt}/${maxRetries})`);
        const res = await axios.get(url, {
          headers: { 'Content-Type': 'application/json', ...getHeaders() },
          timeout: 6000
        });

        // Validate response is a parsed JSON object (not HTML block page or string)
        if (res.data && typeof res.data === 'object') {
          // If it's an API list structure, ensure it contains results or system parameters
          if (Object.keys(res.data).length > 0) {
            circuitBreaker.success();
            return res.data;
          }
        } else if (typeof res.data === 'string' && res.data.includes('<html')) {
          throw new Error('Received HTML webpage block instead of API JSON payload.');
        }

        throw new Error('Invalid or empty response structure from NetMirror.');
      } catch (err) {
        if (err.response && err.response.status === 404) {
          console.log(`[Fetcher] NetMirror returned 404 for ${url}. Treating as empty results and keeping circuit breaker closed.`);
          circuitBreaker.success(); // Treat 404 as a successful transaction (not a block)
          return { results: [] };
        }
        lastError = err;
        console.warn(`[Fetcher] Attempt ${attempt} failed on mirror ${activeMirror}: ${err.message}`);

        // Rotate mirror on failure
        mirrorManager.rotateMirror();
      }
    }

    circuitBreaker.failure();
    throw new Error(`Failed to retrieve data from NetMirror after ${maxRetries} attempts. Last error: ${lastError.message}`);
  });
}

/**
 * 1. Fetch Trending/Latest Media
 */
app.get('/api/trending', async (req, res) => {
  const page = parseInt(req.query.page) || 0;
  const filter = req.query.filter || 'Latest';
  const category = req.query.category || 'All';
  const cacheKey = `${category}_${filter}_${page}`;

  try {
    const MediaList = require('./models/MediaList');
    const Media = require('./models/Media');
    
    const listDoc = await MediaList.findOne({ category, filter }).lean();
    let dbResults = null;
    let localPages = 0;
    
    if (listDoc && listDoc.items && listDoc.items.length > 0) {
      localPages = Math.ceil(listDoc.items.length / 30);
      const startIdx = page * 30;
      const endIdx = startIdx + 30;
      const pageIds = listDoc.items.slice(startIdx, endIdx);
      
      if (pageIds.length > 0) {
        const unorderedMedia = await Media.find({ id: { $in: pageIds } }).lean();
        // Reorder to match exact scraped order
        dbResults = pageIds.map(id => unorderedMedia.find(m => m.id === id)).filter(Boolean);
      }
    }
    if (dbResults && dbResults.length > 0) {
      const mediaList = dbResults.map(item => ({
        id: item.id,
        title: item.title ? item.title.trim() : 'Unknown Title',
        poster: item.backdrop_path || item.poster || 'https://placehold.co/300x450',
        type: item.type === 'TV Show' ? 'TV Show' : 'Movie',
        releaseDate: item.releaseDate || 'N/A',
        country: item.country || '',
        channel: '',
        rating: parseFloat(item.rating) || 0,
        badge: item.badge || '',
        isCustom: false
      }));
      res.setHeader('X-Cache-Status', 'DB_HIT');
      return res.json(mediaList);
    }

    let results = [];
    let status = 'MISS';

    // Map the requested page to Netmirror's page, accounting for local DB pages
    const nmPage = Math.max(0, page - localPages);

    if (filter === 'Trending' && category !== 'Anime') {
      const endpoint = `/tranding?id=11&page=${nmPage}`;
      const cacheRes = await catalogCache.get(endpoint);
      status = cacheRes.status;
      const rawResults = cacheRes.value.results || [];

      results = rawResults.filter(item => {
        const typeLower = (item.media_type || item.type || '').toLowerCase();
        const countryLower = (item.country || item.cn || '').toLowerCase();
        const channelLower = (item.channel || '').toLowerCase();
        const titleLower = (item.title || '').toLowerCase();

        if (category === 'Movies') {
          return typeLower === 'movie' || typeLower === 'movie/';
        }
        if (category === 'Series') {
          return typeLower === 'tv' || typeLower === 'tv show' || typeLower === 'series';
        }
        if (category === 'Anime') {
          return countryLower === 'japan' ||
            channelLower.includes('anime') ||
            titleLower.includes('anime') ||
            titleLower.includes('naruto') ||
            titleLower.includes('boruto') ||
            titleLower.includes('jujutsu') ||
            titleLower.includes('one piece') ||
            titleLower.includes('demon slayer');
        }
        return true;
      });

      // Fallback: If Trending list has no matches for the category, fall back to the explore lists
      if (results.length === 0) {
        let fallbackEndpoint = '';
        if (category === 'Anime') {
          let queryParams = 'genre_ids[]=10&genre_ids[]=6';
          if (filter === 'Hindi') {
            queryParams += '&dubbing=Hindi';
          } else if (filter === 'English') {
            queryParams += '&dubbing=English';
          }
          fallbackEndpoint = `/movies/filter?${queryParams}&items_per_page=30&page=${nmPage}`;
        } else if (category === 'All') {
          fallbackEndpoint = `/movies/filter?sort_by=date&items_per_page=30&page=${nmPage}`;
        } else {
          let typeParam = category === 'Movies' ? '&type=1' : '&type=2';
          fallbackEndpoint = `/movies/filter?sort_by=date${typeParam}&items_per_page=30&page=${nmPage}`;
        }
        const cacheRes = await catalogCache.get(fallbackEndpoint);
        status = cacheRes.status;
        results = cacheRes.value.results || [];
      }
    } else {
      // Non-trending, specific filters
      if (category === 'Anime') {
        let queryParams = 'genre_ids[]=10&genre_ids[]=6';
        if (filter === 'Hindi') {
          queryParams += '&dubbing=Hindi';
        } else if (filter === 'English') {
          queryParams += '&dubbing=English';
        }
        const endpoint = `/movies/filter?${queryParams}&items_per_page=30&page=${nmPage}`;
        const cacheRes = await catalogCache.get(endpoint);
        status = cacheRes.status;
        results = cacheRes.value.results || [];
      } else {
        let queryParams = 'sort_by=date';
        let customEndpoint = null;

        if (category === 'Series') {
          // Build server-side filter params directly to match netmirror.center/explore/tv
          if (filter === 'Hindi') {
            queryParams = 'type=2&dubbing=Hindi';
          } else if (filter === 'English') {
            queryParams = 'type=2&dubbing=English';
          } else if (filter === 'Bollywood') {
            queryParams = 'type=2&country=india&dubbing=Hindi';
          } else if (filter === 'Hollywood') {
            queryParams = 'type=2&country=United+States&sort_by=date';
          } else if (filter === 'Korean') {
            queryParams = 'type=2&country=Korea';
          } else if (filter === 'Chinese') {
            queryParams = 'type=2&country=China';
          } else if (filter === 'South Indian') {
            queryParams = 'type=2&country=india';
          } else {
            // Latest / Trending fallback
            queryParams = 'type=2&sort_by=date';
          }
        } else if (category === 'Movies') {
          if (filter === 'Hindi') {
            queryParams = 'type=1&dubbing=Hindi';
          } else if (filter === 'English') {
            queryParams = 'type=1&dubbing=English';
          } else if (filter === 'Bollywood') {
            queryParams = 'type=1&country=india&dubbing=Hindi';
          } else if (filter === 'Hollywood') {
            queryParams = 'type=1&countryNotParam=india&countryNot=Nigeria&countryNot2=Philippines';
          } else if (filter === 'Korean') {
            queryParams = 'type=1&country=Korea';
          } else if (filter === 'Chinese') {
            queryParams = 'type=1&country=China';
          } else if (filter === 'South Indian') {
            queryParams = 'type=1&country=india';
          } else {
            queryParams = 'type=1&sort_by=date';
          }
        } else {
          // All category (Homepage)
          if (filter === 'Hindi') {
            queryParams = 'dubbing=Hindi';
          } else if (filter === 'English') {
            queryParams = 'dubbing=English';
          } else if (filter === 'Bollywood') {
            queryParams = 'country=India&sort_by=date';
          } else if (filter === 'Hollywood') {
            queryParams = 'country=United+States&sort_by=date';
          } else if (filter === 'Korean') {
            queryParams = 'country=Korea&sort_by=date';
          } else if (filter === 'Chinese') {
            queryParams = 'country=China&sort_by=date';
          } else if (filter === 'South Indian') {
            customEndpoint = `/tranding?id=15&page=${nmPage}`;
          } else {
            queryParams = 'dubbing=Hindi&sort_by=date';
          }
        }

        const endpoint = customEndpoint || `/movies/filter?${queryParams}&items_per_page=30&page=${nmPage}`;
        const cacheRes = await catalogCache.get(endpoint);
        status = cacheRes.status;
        results = cacheRes.value.results || [];
      }
    }

    // Batch lookup all deleted IDs and overrides in one go (massive speedup!)
    const itemIds = results.map(item => String(item.id));
    const [deletedIdsSet, overridesMap] = await Promise.all([
      db.batchGetDeleted(itemIds),
      db.batchGetOverrides(itemIds)
    ]);

    const filteredItems = results.filter(item => !deletedIdsSet.has(String(item.id)));
    const mediaList = filteredItems.map((item) => ({
      id: item.id,
      title: item.title ? item.title.trim() : 'Unknown Title',
      poster: item.backdrop_path || 'https://placehold.co/300x450',
      type: item.media_type === 'tv' ? 'TV Show' : 'Movie',
      releaseDate: item.release_date || 'N/A',
      country: item.cn || '',
      channel: item.channel || '',
      rating: parseFloat(item.vote_average) || 0,
      badge: item.lang || item.dubbing || item.quality || item.badge || '',
      isCustom: overridesMap.has(String(item.id))
    }));

    res.setHeader('X-Cache-Status', status);
    res.json(mediaList);
  } catch (error) {
    console.error('Error fetching trending list:', error.message);
    res.status(500).json({ error: 'Failed to retrieve netmirror catalog.' });
  }
});

/**
 * 2. Search Media — queries all available mirrors in parallel for comprehensive results
 */
/**
 * Suggest (Did you mean)
 */
app.get('/api/suggest', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json([]);
  
  try {
    const allMirrors = mirrorManager.getSearchMirrors();
    const mirror = allMirrors[0] || 'https://api2.imdb4.shop/api';
    // Strip only the trailing /api suffix, not any 'api' occurrence in the hostname
    const baseUrl = mirror.replace(/\/api$/, '');
    const url = `${baseUrl}/suggest.php?q=${encodeURIComponent(query)}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://netmirror.center/'
      },
      timeout: 5000
    });
    
    res.json(response.data);
  } catch (err) {
    console.warn(`[Suggest] Failed for ${query}: ${err.message}`);
    res.json({ results: [] });
  }
});

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const page = parseInt(req.query.page || 0);
  if (!query) return res.json([]);

  try {
    // Decode and clean query
    const decodedQuery = decodeURIComponent(query);
    let cleaned = decodedQuery;
    cleaned = cleaned.replace(/\[.*?\]/g, ' ');
    cleaned = cleaned.replace(/\(.*?\)/g, ' ');
    cleaned = cleaned.replace(/\b(s\d+|season\s*\d+|part\s*\d+)\b/gi, ' ');
    cleaned = cleaned.replace(/[^a-zA-Z0-9\s]/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    let queryToSearch = cleaned || decodedQuery.trim();
    queryToSearch = queryToSearch.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    const formattedQuery = encodeURIComponent(queryToSearch).replace(/%20/g, '+');

    const allMirrors = mirrorManager.getSearchMirrors();

    // Query all available mirrors in parallel — same strategy as client used to do
    const mirrorPromises = allMirrors.map(async (mirror) => {
      const url = `${mirror}/search2/${formattedQuery}?page=${page}`;
      try {
        const res = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://netmirror.center/',
            'Origin': 'https://netmirror.center'
          },
          timeout: 6000
        });
        const data = res.data;
        if (!data || typeof data !== 'object') return [];
        if (data.message && data.message.includes('Access denied')) return [];
        return data.results || [];
      } catch (err) {
        console.warn(`[Search] Mirror ${mirror} failed: ${err.message}`);
        return [];
      }
    });

    const allResultsArray = await Promise.all(mirrorPromises);

    // Merge and deduplicate by ID
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

    if (mergedResults.length === 0) {
      console.warn(`[Search] All mirrors returned 0 results for "${queryToSearch}" page ${page}`);
      return res.json([]);
    }

    // Batch check deleted IDs
    const itemIds = mergedResults.map(item => String(item.id));
    const deletedIdsSet = await db.batchGetDeleted(itemIds);

    const mediaList = mergedResults
      .filter(item => !deletedIdsSet.has(String(item.id)))
      .map(item => ({
        id: item.id,
        title: item.title ? item.title.trim() : 'Unknown Title',
        poster: item.backdrop_path || 'https://placehold.co/300x450',
        type: item.media_type === 'tv' ? 'TV Show' : 'Movie',
        releaseDate: item.release_date || 'N/A',
        country: item.cn || '',
        channel: item.channel || '',
        rating: parseFloat(item.vote_average) || 0,
        badge: item.lang || item.dubbing || item.quality || item.badge || '',
        isCustom: false
      }));

    console.log(`[Search] "${queryToSearch}" page ${page} → ${mediaList.length} results from ${allMirrors.length} mirrors`);
    res.json(mediaList);

    // Background: save search results to MongoDB (new items only)
    setImmediate(async () => {
      try {
        const Media = require('./models/Media');
        const rawItems = mergedResults.filter(item => !deletedIdsSet.has(String(item.id)));
        for (const item of rawItems) {
          await Media.findOneAndUpdate(
            { id: String(item.id) },
            {
              $set: {
                title: item.title || 'Unknown',
                backdrop_path: item.backdrop_path,
                type: item.media_type === 'tv' ? 'TV Show' : 'Movie',
                releaseDate: item.release_date,
                country: item.cn || '',
                badge: item.lang || item.dubbing || item.quality || '',
                rating: String(parseFloat(item.vote_average) || 0),
              }
            },
            { upsert: true }
          );
        }
      } catch (dbErr) {
        // Silent fail — search caching is best-effort
      }
    });

  } catch (error) {
    console.error('Error searching:', error.message);
    res.status(500).json({ error: 'Failed to complete search query.' });
  }
});

/**
 * 3. Fetch Media Details
 */
app.get('/api/details/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const Media = require('./models/Media');
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // ── A. Try MongoDB first (if details were scraped within 24h) ──
    const cachedItem = await Media.findOne({ id: String(id) }).lean();
    if (cachedItem && cachedItem.detailsScrapedAt && cachedItem.detailsScrapedAt > twentyFourHoursAgo) {
      console.log(`[DB] ✅ Serving details from MongoDB for ID: ${id}`);
      res.setHeader('X-Cache-Status', 'DB_HIT');
      return res.json({
        id: cachedItem.id,
        title: cachedItem.title ? cachedItem.title.trim() : 'Unknown Title',
        description: cachedItem.description || 'No description available.',
        poster: cachedItem.backdrop_path || cachedItem.poster || 'https://placehold.co/300x450',
        type: cachedItem.type || 'Movie',
        seasons: cachedItem.seasons || null,
        audioLanguages: cachedItem.audioLanguages && cachedItem.audioLanguages.length > 0 ? cachedItem.audioLanguages : ['Original'],
        trailer: cachedItem.trailer || null,
        _rawItem: cachedItem.rawItem,
      });
    }

    // ── B. Fetch from upstream (existing logic) ──
    const endpoint = `/movie/${id}`;
    const { value: data, status } = await detailsCache.get(endpoint);
    const results = data.results || [];

    if (results.length === 0) {
      return res.status(404).json({ error: 'Movie details not found.' });
    }

    const item = results[0];

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

    const responsePayload = {
      id: item.id,
      title: item.title ? item.title.trim() : 'Unknown Title',
      description: item.dis || 'No description available.',
      poster: item.backdrop_path || 'https://placehold.co/300x450',
      type: mediaType,
      seasons: seasonsList,
      audioLanguages: alternateDubs,
      trailer: item.trailer || null,
      _rawItem: item,
    };

    // ── C. Send response immediately, save to MongoDB in background ──
    res.setHeader('X-Cache-Status', status);
    res.json(responsePayload);

    // Background save (doesn't block response)
    setImmediate(async () => {
      try {
        await Media.findOneAndUpdate(
          { id: String(item.id || id) },
          {
            $set: {
              title: item.title || 'Unknown',
              backdrop_path: item.backdrop_path,
              type: mediaType,
              releaseDate: item.release_date || item.releaseDate,
              country: item.cn || item.country,
              description: item.dis,
              seasons: seasonsList,
              audioLanguages: alternateDubs,
              trailer: item.trailer || null,
              rawItem: item,
              detailsScrapedAt: new Date(),
            }
          },
          { upsert: true }
        );
        console.log(`[DB] 💾 Saved details to MongoDB for ID: ${id} (background)`);
      } catch (dbErr) {
        console.error(`[DB] Failed to save details for ID ${id}:`, dbErr.message);
      }
    });

  } catch (error) {
    console.error(`Error fetching details for ID ${id}:`, error.message);
    res.status(500).json({ error: 'Failed to retrieve movie details.' });
  }
});


app.get('/api/similar/:title', async (req, res) => {
  const { title } = req.params;
  const page = req.query.page || 0;
  try {
    const url = `https://api2.imdb4.shop/api/related/${encodeURIComponent(title)}?page=${page}`;
    const axios = require('axios');
    const response = await axios.get(url, { timeout: 10000 });
    res.json(response.data.results || []);
  } catch (error) {
    console.error(`Error fetching similar titles for ${title}:`, error.message);
    res.json([]); // Return empty array on failure instead of error, so app handles it gracefully
  }
});

function isUrlExpired(url) {
  if (!url || typeof url !== 'string') return true;
  try {
    const parsed = new URL(url);
    // Check standard expiry params only (NOT 't' — hakunaymatata 't' is a sign timestamp, not expiry)
    const expiresParam = parsed.searchParams.get('Expires') || parsed.searchParams.get('expires')
      || parsed.searchParams.get('expiry') || parsed.searchParams.get('exp');
    if (expiresParam) {
      const expiresVal = parseInt(expiresParam, 10);
      if (!isNaN(expiresVal)) {
        const expiresMs = expiresVal < 10000000000 ? expiresVal * 1000 : expiresVal;
        if (Date.now() + 30000 > expiresMs) {
          console.log(`⚠️ URL check: Link has expired (Expiry: ${new Date(expiresMs).toISOString()}, Current: ${new Date().toISOString()})`);
          return true;
        }
      }
    }
  } catch (e) {
    // Ignore invalid URL
  }
  return false;
}

/**
 * 4. Advanced Stream Resolver
 */
app.all('/api/stream/:id', async (req, res) => {
  const { id } = req.params;
  // Sanitize 'null' string values that may come from client
  const rawSe = req.query.season;
  const rawEp = req.query.episode;
  const se = (!rawSe || rawSe === 'null' || rawSe === 'undefined') ? '' : rawSe;
  const ep = (!rawEp || rawEp === 'null' || rawEp === 'undefined') ? '' : rawEp;
  const rawLang = req.query.lang || 'Hindi';
  const lang = (rawLang === 'Original' || !rawLang) ? 'Hindi' : rawLang;
  const clientIp = req.headers['x-forwarded-for'] || req.ip;

  try {
    // A. Intercept if user has custom overridden URLs (Always check before cache so overrides apply instantly)
    const customLinks = await db.getOverride(String(id));
    if (customLinks && customLinks.length > 0) {
      console.log(`🎯 Serving custom URL overrides config for ID: ${id}`);
      return res.json({
        videoUrl: customLinks[0].url,
        qualities: customLinks,
        audioUrl: null,
        referer: null
      });
    }

    const cacheKey = `${id}:${se}:${ep}:${lang}`;

    // ✅ Check streamCache first — avoid re-resolving for same stream if cache is enabled
    const cacheTtl = parseInt(process.env.CACHE_STREAM_TTL_MS || '0');
    const cachedEntry = streamCache.cache.get(cacheKey);
    if (cacheTtl > 0 && cachedEntry && (Date.now() - cachedEntry.fetchedAt) < cacheTtl) {
      console.log(`⚡ [StreamCache] HIT for key: ${cacheKey}`);
      res.setHeader('X-Cache-Status', 'HIT');
      return res.json(cachedEntry.value);
    }

    // ✅ Deduplication: agar 1000 users same stream maangein to sirf 1 request Netmirror ko jayegi
    // Baaki 999 users us ek hi promise ka wait karengy aur result share karengy
    const streamResult = await deduplicator.execute(`stream:${cacheKey}`, async () => {

    let item = null;
    if (req.method === 'POST' && req.body && req.body.item) {
      item = req.body.item;
      console.log(`📦 Using client-provided metadata for ID: ${id}`);
    } else {
      console.log(`📡 Resolving stream for ID: ${id} (Season ${se}, Episode ${ep}, Lang ${lang})`);
      const endpoint = `/movie/${id}`;
      const { value: detailsData } = await detailsCache.get(endpoint);
      const results = detailsData.results || [];
      if (results.length === 0) {
        throw new Error('Movie metadata not found.');
      }
      item = results[0];
    }

    let resolvedVideoUrl = null;
    let resolvedQualities = [];
    let resolvedReferer = REFERER_URL;
    let targetId = id;

    // alternate language handling
    const titleLower = (item.title || '').toLowerCase();
    const isLangAlreadyInTitle = titleLower.includes(`[${lang.toLowerCase()}]`);

    if (lang !== 'Hindi' && !isLangAlreadyInTitle) {
      const baseTitle = item.title.replace(/\[.*?\]/g, '').trim();
      console.log(`🔍 Searching for alternate dub of "${baseTitle}" in ${lang}...`);
      const searchUrl = `/search2/${encodeURIComponent(baseTitle)}?page=0`;
      const searchRes = await fetchFromNetmirrorWithRetry(searchUrl).catch(() => null);

      if (searchRes && searchRes.results) {
        const matchedItem = searchRes.results.find(resItem => {
          const titleLower = resItem.title.toLowerCase();
          return titleLower.includes(lang.toLowerCase());
        });

        if (matchedItem) {
          console.log(`🎯 Found matching ${lang} dub item: "${matchedItem.title}" with ID ${matchedItem.id}`);
          targetId = matchedItem.id;
          const altDetailsRes = await fetchFromNetmirrorWithRetry(`/movie/${targetId}`);
          if (altDetailsRes.results && altDetailsRes.results.length > 0) {
            item = altDetailsRes.results[0];
          }
        }
      }
    }

    const hasValidSeasons = Array.isArray(item.season) && item.season.length > 0 && item.season.some(s => s && s.se > 0);
    let targetSe = se;
    let targetEp = ep;
    if (item.media_type !== 'tv' || !item.season || !hasValidSeasons) {
      targetSe = '';
      targetEp = '';
      console.log(`🎬 Target item is classified as Movie/Single release or has no valid seasons. Clearing season/episode parameters.`);
    }

    // ─── Parallel Resolution: Run all scenarios concurrently ─────────────────
    const resolveTasks = [];

    // Scenario 1: Direct Embed (Skip for TV shows because it's usually just Episode 1 or a trailer)
    if (item.embed && item.media_type !== 'tv' && !hasValidSeasons) {
      resolveTasks.push((async () => {
        const rawEmbedUrl = item.embed;
        const urlParamMatch = rawEmbedUrl.match(/url=([^&]+)/);
        const sParamMatch = rawEmbedUrl.match(/[?&]s=([^&]+)/);
        if (urlParamMatch) {
          const decodedUrl = Buffer.from(urlParamMatch[1], 'base64').toString('ascii');
          const videoUrl = await extractDirectVideoLink(decodedUrl);
          if (videoUrl) {
            if (isUrlExpired(videoUrl)) {
              throw new Error('Embed resolved link is expired');
            }
            let sizeLabel = 'N/A';
            if (sParamMatch) {
              try { sizeLabel = Buffer.from(sParamMatch[1], 'base64').toString('ascii').trim(); } catch (_) { }
            }
            const qualityMatch = (rawEmbedUrl + videoUrl + (item.title || '')).match(/(\d{3,4}p)/i);
            return {
              videoUrl,
              qualities: [{
                quality: qualityMatch ? qualityMatch[1].toUpperCase() : 'HD',
                size: sizeLabel,
                url: videoUrl
              }],
              referer: 'https://movieboxonline.net/'
            };
          }
        }
        throw new Error('Embed resolution failed');
      })());
    }

    // Scenario 2: Watchbox with Signatures
    if (item.dp) {
      resolveTasks.push((async () => {
        const dp = item.dp;
        const titleClean = item.title ? item.title.trim() : 'Video';
        const na = Buffer.from(titleClean).toString('base64');
        const subjectid = item.subjectid || targetId;
        const releaseYear = (item.release_date && item.release_date.match(/\d{4}/)) ? item.release_date.match(/\d{4}/)[0] : '';
        const res = await resolveWatchboxStream(targetId, subjectid, targetSe, targetEp, dp, na, releaseYear, item.tm_id || '', clientIp);
        if (res && res.videoUrl) {
          if (isUrlExpired(res.videoUrl)) {
            throw new Error('Watchbox resolved link is expired');
          }
          return res;
        }
        throw new Error('Watchbox resolution failed');
      })());
    }

    // Scenario 3: embed_json
    if (item.embed_json && Array.isArray(item.embed_json) && item.embed_json.length > 0) {
      resolveTasks.push((async () => {
        const embedItem = item.embed_json.find(x => Number(x.se) === Number(targetSe) && Number(x.ep) === Number(targetEp));
        if (embedItem) {
          const res = await resolveEmbedJsonStream(embedItem, targetId, item.subjectid || targetId, clientIp);
          if (res && res.videoUrl) {
            if (isUrlExpired(res.videoUrl)) {
              throw new Error('EmbedJSON resolved link is expired');
            }
            let qList = res.qualities || [];
            if (qList.length === 0) {
              const qualityMatch = (embedItem.name + res.videoUrl).match(/(\d{3,4}p)/i);
              qList = [{
                quality: qualityMatch ? qualityMatch[1].toUpperCase() : 'HD',
                size: embedItem.size || 'N/A',
                url: res.videoUrl
              }];
            }
            return { videoUrl: res.videoUrl, qualities: qList, referer: res.referer || REFERER_URL };
          }
        }
        throw new Error('EmbedJSON resolution failed');
      })());
    }

    if (resolveTasks.length > 0) {
      try {
        console.log(`📡 Spawning ${resolveTasks.length} parallel stream resolver tasks...`);
        const fastestSuccessfulResult = await Promise.any(resolveTasks);
        resolvedVideoUrl = fastestSuccessfulResult.videoUrl;
        resolvedQualities = fastestSuccessfulResult.qualities || [];
        resolvedReferer = fastestSuccessfulResult.referer || REFERER_URL;
      } catch (err) {
        console.log('⚠️ Parallel stream resolution tasks failed. Trying sequential recovery fallback.');
      }
    }



    if (!resolvedVideoUrl) {
      console.log(`⚠️ Failed to resolve stream for primary ID ${targetId}. Trying auto-recovery fallback...`);
      const baseTitle = item.title.replace(/\[.*?\]/g, '').trim();
      const searchUrl = `/search2/${encodeURIComponent(baseTitle)}?page=0`;
      const searchRes = await fetchFromNetmirrorWithRetry(searchUrl).catch(() => null);

      if (searchRes && searchRes.results) {
        const alternateItems = searchRes.results.filter(resItem => String(resItem.id) !== String(targetId));

        for (const altItem of alternateItems) {
          console.log(`🔄 Attempting recovery with alternate ID: ${altItem.id} ("${altItem.title}")`);
          try {
            const altDetailsRes = await fetchFromNetmirrorWithRetry(`/movie/${altItem.id}`);
            const altResults = altDetailsRes.results || [];
            if (altResults.length > 0) {
              const altItemMeta = altResults[0];

              const isAltTv = altItemMeta.media_type === 'tv' || (Array.isArray(altItemMeta.season) && altItemMeta.season.length > 0);
              
              if (altItemMeta.embed && !isAltTv) {
                const rawEmbedUrl = altItemMeta.embed;
                const urlParamMatch = rawEmbedUrl.match(/url=([^&]+)/);
                const sParamMatch = rawEmbedUrl.match(/[?&]s=([^&]+)/);
                if (urlParamMatch) {
                  const decodedUrl = Buffer.from(urlParamMatch[1], 'base64').toString('ascii');
                  resolvedVideoUrl = await extractDirectVideoLink(decodedUrl);
                  if (resolvedVideoUrl) {
                    let sizeLabel = 'N/A';
                    if (sParamMatch) {
                      try { sizeLabel = Buffer.from(sParamMatch[1], 'base64').toString('ascii').trim(); } catch (_) { }
                    }
                    const qualityMatch = (rawEmbedUrl + resolvedVideoUrl + (altItemMeta.title || '')).match(/(\d{3,4}p)/i);
                    resolvedQualities = [{
                      quality: qualityMatch ? qualityMatch[1].toUpperCase() : 'HD',
                      size: sizeLabel,
                      url: resolvedVideoUrl
                    }];
                  }
                }
              }

              if (!resolvedVideoUrl && altItemMeta.dp) {
                const altNa = Buffer.from(altItemMeta.title ? altItemMeta.title.trim() : 'Video').toString('base64');
                const releaseYear = (altItemMeta.release_date && altItemMeta.release_date.match(/\d{4}/)) ? altItemMeta.release_date.match(/\d{4}/)[0] : '';
                const watchboxResult = await resolveWatchboxStream(altItem.id, targetSe, targetEp, altItemMeta.dp, altNa, releaseYear, altItemMeta.tm_id || '', clientIp);
                if (watchboxResult) {
                  resolvedVideoUrl = watchboxResult.videoUrl;
                  resolvedQualities = watchboxResult.qualities || [];
                  resolvedReferer = watchboxResult.referer || REFERER_URL;
                }
              }

              if (!resolvedVideoUrl && altItemMeta.embed_json && Array.isArray(altItemMeta.embed_json) && altItemMeta.embed_json.length > 0) {
                const altEmbedItem = altItemMeta.embed_json.find(x => Number(x.se) === Number(targetSe) && Number(x.ep) === Number(targetEp));
                if (altEmbedItem) {
                  console.log(`[Fetcher] Found exact embed_json match in alternative result (ID: ${altItem.id}) for S${targetSe}E${targetEp}`);
                  const embedJsonResult = await resolveEmbedJsonStream(altEmbedItem, altItem.id, altItem.subjectid || altItem.id, clientIp);
                  if (embedJsonResult && embedJsonResult.videoUrl) {
                    resolvedVideoUrl = embedJsonResult.videoUrl;
                    resolvedQualities = embedJsonResult.qualities || [];
                    resolvedReferer = embedJsonResult.referer || REFERER_URL;
                    if (resolvedQualities.length === 0 && resolvedVideoUrl) {
                      const qualityMatch = (altEmbedItem.name + resolvedVideoUrl).match(/(\d{3,4}p)/i);
                      resolvedQualities = [{
                        quality: qualityMatch ? qualityMatch[1].toUpperCase() : 'HD',
                        size: altEmbedItem.size || 'N/A',
                        url: resolvedVideoUrl
                      }];
                    }
                  }
                }
              }



              if (resolvedVideoUrl) {
                if (isUrlExpired(resolvedVideoUrl)) {
                  console.log(`⚠️ Alternate ID resolved link was expired. Discarding.`);
                  resolvedVideoUrl = null;
                  resolvedQualities = [];
                } else {
                  console.log(`🔥 Recovery SUCCESS! Using stream from alternate ID ${altItem.id}`);
                  break;
                }
              }
            }
          } catch (altErr) {
            console.log(`⚠️ Alternate ID ${altItem.id} recovery failed: ${altErr.message}`);
          }
        }
      }
    }

    if (!resolvedVideoUrl) {
      throw new Error('Failed to resolve stream link on any host provider.');
    }

    const resolvedData = {
      videoUrl: resolvedVideoUrl,
      qualities: resolvedQualities,
      audioUrl: null,
      referer: resolvedReferer
    };

    // ✅ Cache the resolved stream only if cache TTL is enabled (greater than 0)
    if (cacheTtl > 0) {
      streamCache.set(cacheKey, resolvedData);
    }
    console.log(`🔥 Resolved final streaming file: ${resolvedVideoUrl}`);
    return resolvedData; // deduplicator closure return

    }); // ← deduplicator.execute() end: sirf 1 user Netmirror tak gaya, baaki ne result share kiya!

    res.setHeader('X-Cache-Status', 'MISS');
    res.json(streamResult);
  } catch (error) {
    console.error(`Error resolving stream for ID ${id}:`, error.message);
    res.status(500).json({ error: 'Failed to resolve streaming file.' });
  }
});

/**
 * 5. Download Qualities Resolver
 * Fetches the real quality options available for a given media item by scraping
 * the watchbox player HTML for div.dl-item entries (e.g. "720P 764.2MB" + CDN URL).
 * Falls back to embed s= size param for drivehub-style single-quality items.
 */
app.all('/api/download-qualities/:id', async (req, res) => {
  const { id } = req.params;
  const se = req.query.season || '';
  const ep = req.query.episode || '';
  const lang = req.query.lang || 'Hindi';
  const clientIp = req.headers['x-forwarded-for'] || req.ip;

  try {
    // A. Intercept if user has custom overridden download URLs
    const customLinks = await db.getOverride(String(id));
    if (customLinks && customLinks.length > 0) {
      console.log(`🎯 Serving custom download qualities override for ID: ${id}`);
      return res.json({ qualities: customLinks, referer: '' });
    }

    let item = null;
    if (req.method === 'POST' && req.body && req.body.item) {
      item = req.body.item;
      console.log(`📦 Using client-provided download qualities metadata for ID: ${id}`);
    } else {
      console.log(`🔍 Fetching download qualities for ID: ${id} (S${se}E${ep} lang=${lang})`);
      const endpoint = `/movie/${id}`;
      const { value: detailsData } = await detailsCache.get(endpoint);
      const results = detailsData.results || [];
      if (results.length === 0) {
        return res.status(404).json({ error: 'Media not found.' });
      }
      item = results[0];
    }

    let targetId = id;
    let targetSe = se;
    let targetEp = ep;

    // Alternate language lookup
    if (lang !== 'Hindi') {
      const baseTitle = item.title.replace(/\[.*?\]/g, '').trim();
      const searchRes = await fetchFromNetmirrorWithRetry(`/search2/${encodeURIComponent(baseTitle)}?page=0`).catch(() => null);
      if (searchRes && searchRes.results) {
        const matchedItem = searchRes.results.find(r => r.title.toLowerCase().includes(lang.toLowerCase()));
        if (matchedItem) {
          targetId = matchedItem.id;
          const altDetails = await fetchFromNetmirrorWithRetry(`/movie/${targetId}`).catch(() => null);
          if (altDetails && altDetails.results && altDetails.results.length > 0) {
            item = altDetails.results[0];
          }
        }
      }
    }

    // Clear season/ep for movies
    if (item.media_type !== 'tv' || !item.season || (Array.isArray(item.season) && item.season.length === 0)) {
      targetSe = '';
      targetEp = '';
    }

    let qualities = [];
    let resolvedReferer = REFERER_URL;

    // Strategy A: Watchbox (dp field) — scrape popup-window dl-item entries
    if (item.dp) {
      const dp = item.dp;
      const titleClean = item.title ? item.title.trim() : 'Video';
      const na = Buffer.from(titleClean).toString('base64');
      const subjectid = item.subjectid || targetId;
      const releaseYear = (item.release_date && item.release_date.match(/\d{4}/)) ? item.release_date.match(/\d{4}/)[0] : '';
      qualities = await extractWatchboxQualities(targetId, subjectid, targetSe, targetEp, dp, na, releaseYear, item.tm_id || '', clientIp);
    }

    // Strategy B: Embed / drivehub-style — single quality from s= param
    if (qualities.length === 0 && item.embed) {
      const rawEmbedUrl = item.embed;
      const urlParamMatch = rawEmbedUrl.match(/url=([^&]+)/);
      const sParamMatch = rawEmbedUrl.match(/[?&]s=([^&]+)/);

      if (urlParamMatch) {
        const decodedUrl = Buffer.from(urlParamMatch[1], 'base64').toString('ascii');
        const directUrl = await extractDirectVideoLink(decodedUrl);
        if (directUrl) {
          let sizeLabel = 'N/A';
          if (sParamMatch) {
            try { sizeLabel = Buffer.from(sParamMatch[1], 'base64').toString('ascii').trim(); } catch (_) { }
          }
          const qualityMatch = (rawEmbedUrl + directUrl + (item.title || '')).match(/(\d{3,4}p)/i);
          qualities.push({
            quality: qualityMatch ? qualityMatch[1].toUpperCase() : 'HD',
            size: sizeLabel,
            url: directUrl
          });
        }
      }
    }

    // Strategy C: embed_json
    if (qualities.length === 0 && item.embed_json && Array.isArray(item.embed_json) && item.embed_json.length > 0) {
      const targetItem = item.embed_json.find(x => Number(x.se) === Number(targetSe) && Number(x.ep) === Number(targetEp));
      if (targetItem && targetItem.name) {
        // From embed_json
        const embedJsonResult = await resolveEmbedJsonStream(targetItem, targetId, item.subjectid || targetId, clientIp);
        if (embedJsonResult && embedJsonResult.videoUrl) {
          resolvedReferer = embedJsonResult.referer || REFERER_URL;
          if (embedJsonResult.qualities && embedJsonResult.qualities.length > 0) {
            qualities = embedJsonResult.qualities;
          } else if (embedJsonResult.videoUrl) {
            const qualityMatch = (targetItem.name + embedJsonResult.videoUrl).match(/(\d{3,4}p)/i);
            qualities = [{
              quality: qualityMatch ? qualityMatch[1].toUpperCase() : 'HD',
              size: targetItem.size || 'N/A',
              url: embedJsonResult.videoUrl
            }];
          }
        }
      }
    }



    if (qualities.length === 0) {
      return res.status(404).json({ error: 'No download qualities found for this media.' });
    }

    console.log(`✅ Found ${qualities.length} quality option(s) for ID ${id}:`, qualities.map(q => `${q.quality} ${q.size}`).join(', '));
    res.json({ qualities, referer: resolvedReferer });
  } catch (error) {
    console.error(`Error fetching download qualities for ID ${id}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch download qualities.' });
  }
});

/**
 * Extracts download quality options from watchbox player HTML by querying all domains concurrently.
 * CRITICAL FIX: id=subjectid in URL, nid=movieId, signature uses movieId:serverTime format.
 */
async function extractWatchboxQualities(movieId, subjectid, se, ep, dp, na, releaseYear, tmId, clientIp = null) {
  const WATCHBOX_DOMAINS = [
    'bet.watch21.shop',
    'play.watch21.shop',
    'limit.watch22.shop',
    'bet.watch22.shop',
    'spedostream2.shop',
    'dv.watch22.shop',
    'speed.watch22.shop',
    'test.watch22.shop'
  ];
  const netmirrorReferer = 'https://netmirror.center/';

  // Fetch SERVER_TIME from the movie page
  let pageServerTime = null;
  try {
    const pageRes = await axios.get(`https://netmirror.center/movie/${movieId}/`, {
      headers: getHeaders(netmirrorReferer, clientIp),
      timeout: 5000
    });
    const stMatch = pageRes.data.match(/window\.SERVER_TIME\s*=\s*(\d+)/);
    if (stMatch) pageServerTime = stMatch[1];
  } catch (e) { /* ignore */ }

  const makeSignature = (ts) => crypto.createHmac('sha256', HM_SECRET).update(`${movieId}:${ts}`).digest('hex');

  const promises = WATCHBOX_DOMAINS.map(async (domain) => {
    const seVal = se || '0';
    const epVal = ep || '0';
    const watchboxBaseUrl = `https://${domain}/play/watchbox.php?id=${subjectid}&se=${seVal}&ep=${epVal}&dp=${encodeURIComponent(dp)}&na=${encodeURIComponent(na)}&year=${releaseYear}&tm_id=${tmId}&exten=true&nid=${movieId}&tv=&token=`;

    let ts = pageServerTime;
    let signature;

    if (ts) {
      signature = makeSignature(ts);
    } else {
      const dummyRes = await axios.get(`${watchboxBaseUrl}&ts=0&sig=0`, {
        headers: getHeaders(netmirrorReferer, clientIp),
        timeout: 6000
      });
      const timeMatch = dummyRes.data.match(/Time not Found\.<br><br>(\d+)/);
      if (!timeMatch) {
        console.error(`[Watchbox ${domain}] No time challenge. Body preview:`, dummyRes.data.slice(0, 100).replace(/\n/g, ' '));
        throw new Error(`Domain ${domain}: No time challenge received`);
      }
      ts = timeMatch[1];
      signature = makeSignature(ts);
      console.log(`[Watchbox ${domain}] Using fallback ts=${ts}, sig=${signature}`);
    }

    const authRes = await axios.get(`${watchboxBaseUrl}&ts=${ts}&sig=${signature}`, {
      headers: getHeaders(netmirrorReferer, clientIp),
      timeout: 8000
    });
    const html = authRes.data;

    if (html.includes('Server Buzy') || html.includes('Not Found. or Come from listed Website.')) {
      console.error(`[Watchbox ${domain}] Server returned busy/not found.`);
      throw new Error(`[Watchbox ${domain}] Server busy`);
    }

    const parsed = parseWatchboxQualities(html);
    if (parsed.length === 0) {
      console.error(`[Watchbox ${domain}] No qualities in HTML. HTML preview:`, html.slice(0, 100).replace(/\n/g, ' '));
      throw new Error(`[Watchbox ${domain}] No qualities in HTML`);
    }
    console.log(`[Watchbox ${domain}] Found ${parsed.length} qualities.`);
    return parsed;
  });

  try {
    return await Promise.any(promises);
  } catch (aggregateError) {
    console.error('❌ All concurrent watchbox quality extractors failed.');
    return [];
  }
}

/**
 * Parses watchbox HTML to extract quality/size/URL from popup-window div.dl-item elements.
 * Each dl-item text is like "720P 764.2MB" and the CDN URL is in a myFunction_dl onclick.
 */
function parseWatchboxQualities(html) {
  const $ = cheerio.load(html);
  const qualities = [];

  $('.dl-item').each((i, el) => {
    const itemText = $(el).clone().children().remove().end().text().trim()
      || $(el).text().trim();
    const qualityMatch = itemText.match(/(\d{3,4}[Pp])/);
    const sizeMatch = itemText.match(/(\d+(?:\.\d+)?)\s*(GB|MB|KB)/i);

    // CDN URL from myFunction_dl onclick
    let cdnUrl = null;
    const onclickAttr = $(el).find('[onclick]').first().attr('onclick') || '';
    const urlMatch = onclickAttr.match(/myFunction(?:_dl)?\s*\(\s*['"]([^'"]+)['"]/);
    if (urlMatch) cdnUrl = urlMatch[1];

    if (qualityMatch && cdnUrl) {
      qualities.push({
        quality: qualityMatch[1].toUpperCase(),
        size: sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}` : 'N/A',
        url: cdnUrl
      });
    }
  });

  return qualities;
}

/**
 * Scrapes direct streaming file URL from final hosting providers
 */
async function extractDirectVideoLink(hostUrl) {
  try {
    console.log(`📡 Parsing hosting server: ${hostUrl}`);
    const res = await axios.get(hostUrl, { headers: getHeaders() });
    const html = res.data;
    const $ = cheerio.load(html);

    const sourceSrc = $('video source').attr('src');
    if (sourceSrc) return sourceSrc;

    const downloadHref = $('.download-link').attr('href') || $('.button2').attr('href');
    if (downloadHref) return downloadHref;

    const r2Match = html.match(/(https?:\/\/[a-zA-Z0-9.-]+\.r2\.dev\/[^\'\"]+)/);
    if (r2Match) return r2Match[1];

    const mediaMatch = html.match(/(https?:\/\/[^\'\"]+\.(mp4|m3u8|mkv)[^\'\"]*)/);
    if (mediaMatch) return mediaMatch[1];

    return null;
  } catch (e) {
    console.error('Host extraction failed:', e.message);
    return null;
  }
}

/**
 * Syncs time and generates dynamic HMAC signatures to unlock watchbox player streams.
 * CRITICAL FIX: 
 *   - id parameter in URL = subjectid (content provider's internal ID)
 *   - nid parameter in URL = movieId (NetMirror's database ID)  
 *   - Timestamp = window.SERVER_TIME from the NetMirror movie page
 *   - Signature = HmacSHA256(movieId + ':' + timestamp, "net###@@sss")
 */
async function resolveWatchboxStream(movieId, subjectid, se, ep, dp, na, releaseYear, tmId, clientIp = null) {
  const WATCHBOX_DOMAINS = [
    'bet.watch21.shop',
    'play.watch21.shop',
    'limit.watch22.shop',
    'bet.watch22.shop',
    'spedostream2.shop',
    'dv.watch22.shop',
    'speed.watch22.shop',
    'test.watch22.shop'
  ];
  const netmirrorReferer = 'https://netmirror.center/';

  // Fetch SERVER_TIME from the NetMirror movie page (same as browser does via window.SERVER_TIME)
  let pageServerTime = null;
  try {
    const pageRes = await axios.get(`https://netmirror.center/movie/${movieId}/`, {
      headers: getHeaders(netmirrorReferer, clientIp),
      timeout: 5000
    });
    const stMatch = pageRes.data.match(/window\.SERVER_TIME\s*=\s*(\d+)/);
    if (stMatch) pageServerTime = stMatch[1];
  } catch (e) {
    console.warn('[Watchbox] Could not fetch SERVER_TIME from page:', e.message);
  }

  // Signature: HmacSHA256(movieId + ':' + timestamp, secret) — as per JS bundle $6() function
  const makeSignature = (ts) => crypto.createHmac('sha256', HM_SECRET).update(`${movieId}:${ts}`).digest('hex');

  console.log(`⚡ Concurrently resolving watchbox streams across ${WATCHBOX_DOMAINS.length} domains (subjectid=${subjectid}, nid=${movieId})...`);

  const promises = WATCHBOX_DOMAINS.map(async (domain) => {
    try {
      // id=subjectid (content provider ID), nid=movieId (NetMirror ID) — CRITICAL
      // Use browser-exact format: exten=true (not exten=1), se=0/ep=0 for movies (not empty)
      // This matches the cache key watchbox uses when browser requests it — avoids stale cached CDN URLs
      const seVal = se || '0';
      const epVal = ep || '0';
      const watchboxBaseUrl = `https://${domain}/play/watchbox.php?id=${subjectid}&se=${seVal}&ep=${epVal}&dp=${encodeURIComponent(dp)}&na=${encodeURIComponent(na)}&year=${releaseYear}&tm_id=${tmId}&exten=true&nid=${movieId}&tv=&token=`;

      let ts = pageServerTime;
      let signature;

      if (ts) {
        // Use page SERVER_TIME (preferred — matches browser behavior)
        signature = makeSignature(ts);
      } else {
        // Fallback: get time challenge from watchbox.php itself
        const dummyRes = await axios.get(`${watchboxBaseUrl}&ts=0&sig=0`, {
          headers: getHeaders(netmirrorReferer, clientIp),
          timeout: 6000
        });
        const timeMatch = dummyRes.data.match(/Time not Found\.<br><br>(\d+)/);
        if (!timeMatch) throw new Error(`Domain ${domain}: No time challenge received`);
        ts = timeMatch[1];
        signature = makeSignature(ts);
      }

      const authUrl = `${watchboxBaseUrl}&ts=${ts}&sig=${signature}`;
      // console.log(`[Watchbox ${domain}] Fetching authUrl: ${authUrl.replace(/dp=[^&]+/, 'dp=HIDDEN')}`);
      const authRes = await axios.get(authUrl, {
        headers: { ...getHeaders(netmirrorReferer, clientIp), 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' },
        timeout: 8000
      });
      const htmlContent = authRes.data;

      if (htmlContent.includes('Server Buzy') || htmlContent.includes('Not Found. or Come from listed Website.')) {
        console.error(`[Watchbox ${domain}] HTML contained Server Buzy / Not Found`);
        throw new Error(`Domain ${domain} returned busy/not found.`);
      }

      const resolvedUrl = parseWatchboxHtml(htmlContent);
      if (resolvedUrl) {
        console.log(`[Watchbox] Fast resolution SUCCESS on domain: ${domain}`);
        const parsedQualities = parseWatchboxQualities(htmlContent);
        const finalReferer = resolvedUrl.includes('proxy') ? `https://${domain}/` : 'https://movieboxonline.net/';
        return { videoUrl: resolvedUrl, qualities: parsedQualities, referer: finalReferer };
      }
      console.error(`[Watchbox ${domain}] Failed parsing HTML for resolvedUrl. HTML start:`, htmlContent.slice(0, 100).replace(/\n/g, ' '));
      throw new Error(`Domain ${domain} failed parsing HTML.`);
    } catch (err) {
      console.error(`[Watchbox ${domain}] Exception:`, err.message);
      throw err;
    }
  });

  try {
    const result = await Promise.any(promises);
    return result;
  } catch (aggregateError) {
    console.error('❌ All concurrent watchbox servers failed resolving streams.');
    return null;
  }
}


/**
 * Resolves streams using the embed_json configuration (concurrently across watchbox servers)
 */
async function resolveEmbedJsonStream(embedItem, movieId, subjectid, clientIp = null) {
  const WATCHBOX_DOMAINS = [
    'bet.watch21.shop',
    'play.watch21.shop',
    'limit.watch22.shop',
    'bet.watch22.shop',
    'spedostream2.shop',
    'dv.watch22.shop',
    'speed.watch22.shop',
    'test.watch22.shop'
  ];
  const netmirrorReferer = REFERER_URL;

  console.log(`⚡ Concurrently resolving embed_json stream for name=${embedItem.name}...`);

  const promises = WATCHBOX_DOMAINS.map(async (domain) => {
    try {
      const watchboxBaseUrl = `https://${domain}/play/${embedItem.name}.php?url=${encodeURIComponent(embedItem.url)}&size=${encodeURIComponent(embedItem.size || '')}&se=${embedItem.se}&ep=${embedItem.ep}&name=${encodeURIComponent(embedItem.name)}&id=${subjectid}&nid=${movieId}&exten=1`;
      const dummyUrl = `${watchboxBaseUrl}&ts=0&sig=0`;

      const dummyRes = await axios.get(dummyUrl, {
        headers: getHeaders(netmirrorReferer, clientIp),
        timeout: 6000
      });

      let serverTime = null;
      const timeMatch = dummyRes.data.match(/Time not Found\.<br><br>(\d+)/);
      let htmlContent = '';

      if (timeMatch) {
        serverTime = timeMatch[1];
        const signature = crypto.createHmac('sha256', HM_SECRET).update(`${movieId}:${serverTime}`).digest('hex');
        const authUrl = `${watchboxBaseUrl}&ts=${serverTime}&sig=${signature}`;

        const authRes = await axios.get(authUrl, {
          headers: getHeaders(netmirrorReferer, clientIp),
          timeout: 6000
        });
        htmlContent = authRes.data;
      } else {
        htmlContent = dummyRes.data;
      }


      if (htmlContent.includes('Server Buzy') || htmlContent.includes('Not Found. or Come from listed Website.')) {
        throw new Error(`Domain ${domain} returned busy/not found.`);
      }

      const resolvedUrl = parseWatchboxHtml(htmlContent);
      if (resolvedUrl) {
        console.log(`[EmbedJson] Fast resolution SUCCESS on domain: ${domain}`);
        const parsedQualities = parseWatchboxQualities(htmlContent);
        const finalReferer = resolvedUrl.includes('proxy') ? `https://${domain}/` : 'https://movieboxonline.net/';
        return { videoUrl: resolvedUrl, qualities: parsedQualities, referer: finalReferer };
      }
      throw new Error(`Domain ${domain} failed parsing HTML.`);
    } catch (err) {
      throw err;
    }
  });

  try {
    const result = await Promise.any(promises);
    return result;
  } catch (aggregateError) {
    console.log('❌ All concurrent watchbox servers failed resolving embed_json links.');
    return null;
  }
}


/**
 * Parses watchbox HTML to find the direct video link
 */
function parseWatchboxHtml(html) {
  const $ = cheerio.load(html);

  const sourceSrc = $('video source').attr('src');
  if (sourceSrc) return sourceSrc;

  const bcdnMatch = html.match(/(https:\/\/[a-zA-Z0-9.-]+\.hakunaymatata\.com\/[^\'\"]+\.mp4\?[^\'\"]+)/);
  if (bcdnMatch) return bcdnMatch[1];

  const r2Match = html.match(/(https:\/\/[a-zA-Z0-9.-]+\.r2\.dev\/[^\'\"]+\?[^\'\"]+)/);
  if (r2Match) return r2Match[1];

  const proxyMatch = html.match(/(https:\/\/[a-zA-Z0-9.-]+proxy[a-zA-Z0-9.-]*\/\?url=[^\'\"]+)/);
  if (proxyMatch) return proxyMatch[1];

  const playUrlMatch = html.match(/play_url\(['"](https:\/\/[^\'"]+)['"]\)/);
  if (playUrlMatch && !playUrlMatch[1].includes('notfound')) return playUrlMatch[1];

  return null;
}

// ─── ADMIN PANEL ROUTING ENDPOINTS ──────────────────────────────────────────

// Serving static web interface on "/" and "/admin"
app.get(['/', '/admin'], (req, res) => {
  res.sendFile(path.join(__dirname, 'netmirror_home.html'));
});

// CRUD Endpoint: DELETE Media Item (Removal)
app.delete('/api/media/:id', async (req, res) => {
  const { id } = req.params;
  const title = req.query.title || 'Unknown Title';
  if (!id) return res.status(400).json({ error: 'Missing ID parameter' });

  await db.addDeleted(id, title);
  res.json({ success: true, message: `Media ${id} successfully removed from frontend list.` });
});

// CRUD Endpoint: GET List of Deleted Items
app.get('/api/deleted-list', async (req, res) => {
  const list = await db.getAllDeleted();
  res.json(list);
});

// CRUD Endpoint: POST Restore Media Item (Removal Undo)
app.post('/api/media-restore/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing ID parameter' });

  await db.removeDeleted(id);
  res.json({ success: true, message: `Media ${id} successfully restored.` });
});

// CRUD Endpoint: GET Custom URL Overrides for target media
app.get('/api/media-custom/:id', async (req, res) => {
  const { id } = req.params;
  const customLinks = (await db.getOverride(String(id))) || [];
  res.json({ id, customLinks });
});

// CRUD Endpoint: POST Custom URL Overrides
app.post('/api/media-custom/:id', async (req, res) => {
  const { id } = req.params;
  const { customLinks } = req.body;

  if (!id || !Array.isArray(customLinks)) {
    return res.status(400).json({ error: 'Invalid input payload parameters' });
  }

  if (customLinks.length === 0) {
    await db.deleteOverride(id);
  } else {
    await db.setOverride(id, customLinks);
    // Automatically clear reported error for this ID since it's now custom-overridden
    await db.removeReportedError(id);
  }

  res.json({ success: true, message: `Custom links saved for Media ID ${id}.` });
});

// CRUD Endpoint: POST Report broken video
app.post('/api/report-error', async (req, res) => {
  const { id, title, type, season, episode } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing ID parameter' });

  await db.addReportedError(id, title || 'Unknown Title', type || 'Movie', season || '', episode || '');
  res.json({ success: true, message: `Media ID ${id} reported as broken.` });
});

// CRUD Endpoint: GET List of Reported Errors
app.get('/api/reported-errors', async (req, res) => {
  const list = await db.getAllReportedErrors();
  res.json(list);
});

// CRUD Endpoint: DELETE Ignore / Clear Reported Error
app.delete('/api/reported-errors/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing ID parameter' });

  await db.removeReportedError(id);
  res.json({ success: true, message: `Reported error for ID ${id} cleared.` });
});

// ─── AD CONFIG ──────────────────────────────────────────────────────────────
// In-memory ad config — toggle ads remotely without any app update
// To persist across server restarts, this can be moved to MongoDB.
let adConfigStore = {
  adsEnabled: true,          // Master toggle — set to true to show ads to all users
  interstitialCloseDelay: 5,  // Seconds before close button appears on interstitial
  rewardedAdDuration: 30,     // Seconds user must watch rewarded ad before claiming reward
  appUpdateLink: '',          // Global APK URL to trigger OTA updates across all clients
  rewardedTriggers: {
    playHd: false,            // Watch ad to play HD video
    download: false,          // Watch ad to download
    nextEpisode: false        // Watch ad to play next episode
  },
  bannerScript: '',           // HTML/JS ad script for banner ads (300x250)
  nativeScript: '',           // HTML/JS ad script for native/inline ads
  interstitialScript: '',     // HTML/JS ad script for full-screen interstitial ads
  backgroundScript: '',       // HTML/JS ad script (push notifications, popunder)
  rewardedScript: '',         // HTML/JS ad script for rewarded ads (user watches to earn reward)
  updatedAt: null
};

// Public endpoint — no HMAC required (old app versions can access)
app.get('/api/ad-config', (req, res) => {
  res.json(adConfigStore);
});

// Admin endpoint — update ad config (protected by HMAC)
app.post('/api/ad-config/update', (req, res) => {
  const {
    adsEnabled,
    interstitialCloseDelay,
    rewardedAdDuration,
    rewardedTriggers,
    bannerScript,
    nativeScript,
    interstitialScript,
    backgroundScript,
    rewardedScript,
    appUpdateLink
  } = req.body;

  if (typeof adsEnabled === 'boolean') adConfigStore.adsEnabled = adsEnabled;
  if (typeof interstitialCloseDelay === 'number') adConfigStore.interstitialCloseDelay = interstitialCloseDelay;
  if (typeof rewardedAdDuration === 'number') adConfigStore.rewardedAdDuration = rewardedAdDuration;
  if (typeof appUpdateLink === 'string') adConfigStore.appUpdateLink = appUpdateLink;
  if (rewardedTriggers && typeof rewardedTriggers === 'object') {
    adConfigStore.rewardedTriggers = {
      playHd: !!rewardedTriggers.playHd,
      download: !!rewardedTriggers.download,
      nextEpisode: !!rewardedTriggers.nextEpisode
    };
  }
  if (typeof bannerScript === 'string') adConfigStore.bannerScript = bannerScript;
  if (typeof nativeScript === 'string') adConfigStore.nativeScript = nativeScript;
  if (typeof interstitialScript === 'string') adConfigStore.interstitialScript = interstitialScript;
  if (typeof backgroundScript === 'string') adConfigStore.backgroundScript = backgroundScript;
  if (typeof rewardedScript === 'string') adConfigStore.rewardedScript = rewardedScript;
  adConfigStore.updatedAt = new Date().toISOString();

  console.log(`[AdConfig] Updated — adsEnabled: ${adConfigStore.adsEnabled}`);
  res.json({ success: true, config: adConfigStore });
});

// Get active mirrors
app.get('/api/mirrors', (req, res) => {
  res.json({
    activeMirror: mirrorManager.getActiveMirror(),
    mirrors: mirrorManager.mirrors
  });
});

// Root endpoint for Railway health checks and browser testing
app.get('/', (req, res) => {
  res.json({ status: 'CineStream Backend is Running!', version: '1.0.0' });
});

// Telemetry & Health endpoint
app.get('/api/health', async (req, res) => {
  const uptime = Math.floor(process.uptime());
  const activeMirror = mirrorManager.getActiveMirror();
  const allMirrors = mirrorManager.getMirrors();
  const memory = process.memoryUsage();

  res.json({
    status: 'ok',
    uptime: `${uptime}s`,
    activeMirror,
    allMirrors,
    mongodb: db.getStatus(),
    circuitBreaker: circuitBreaker.getState(),
    catalogCache: catalogCache.getMetrics(),
    detailsCache: detailsCache.getMetrics(),
    searchCache: searchCache.getMetrics(),
    streamCache: streamCache.getMetrics(),
    memory: {
      heapUsed: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      rss: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`
    }
  });
});

// Periodic Cache Cleanup
setInterval(() => {
  catalogCache.cleanupExpired();
  detailsCache.cleanupExpired();
  searchCache.cleanupExpired();
}, 60000);

// --- Admin Scraper Routes ---
app.get('/api/admin/force-sync-catalog', (req, res) => {
  if (!app.locals.scraper) return res.status(500).json({ error: 'Scraper not initialized' });
  
  // Start async, don't await so request doesn't timeout
  app.locals.scraper.syncCatalog();
  res.json({ message: 'Catalog sync started in background. Check terminal logs for progress.' });
});

app.get('/api/admin/force-sync-links', (req, res) => {
  if (!app.locals.scraper) return res.status(500).json({ error: 'Scraper not initialized' });
  
  app.locals.scraper.syncVideoLinks();
  res.json({ message: 'Video links sync started in background. Check terminal logs for progress.' });
});

// Server Listen
// ============================================================================
// PUSH NOTIFICATIONS API
// ============================================================================

app.post('/api/register-push-token', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });
  
  const success = await db.registerPushToken(token);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to register token' });
  }
});

app.post('/api/send-push-notification', async (req, res) => {
  const { title, message, imageUrl } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message are required' });

  try {
    const tokens = await db.getAllPushTokens();
    if (!tokens || tokens.length === 0) {
      return res.json({ success: true, message: 'No devices registered for notifications.' });
    }

    const messages = [];
    for (let pushToken of tokens) {
      const msg = {
        to: pushToken,
        sound: 'default',
        title: title,
        body: message,
        priority: 'high',
        channelId: 'default',
        data: { },
      };
      
      // Pass the image URL natively to Expo
      if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
        msg.image = imageUrl;
      }
      
      messages.push(msg);
    }

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const data = await response.json();
    res.json({ success: true, expoResponse: data, count: tokens.length });
  } catch (error) {
    console.error('[Push] Error sending push notification:', error);
    res.status(500).json({ error: 'Failed to broadcast' });
  }
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n🚀 Production Scraper Server active on http://0.0.0.0:${PORT}/api`);

  // Connect to MongoDB Atlas
  await db.connectMongo();

  // Start Mirror discovery
  await mirrorManager.start();

  // Initialize and start automated scraper
  const scraper = new ScraperService(
    (endpoint) => fetchFromNetmirrorWithRetry(endpoint),
    (endpoint) => fetchFromNetmirrorWithRetry(endpoint)
  );
  scraper.startCronJob();
  app.locals.scraper = scraper;

  // Background Warmup
  console.log('[Warmup] Initializing background cache pre-fetch...');
  const warmupEndpoints = [
    '/movies/filter?sort_by=date&items_per_page=30&page=0', // Latest All Page 0
    '/movies/filter?sort_by=date&items_per_page=30&page=1', // Latest All Page 1
    '/movies/filter?sort_by=date&country=Japan&items_per_page=30&page=0', // Anime Page 0
    '/movies/filter?sort_by=date&country=Japan&items_per_page=30&page=1', // Anime Page 1
    '/movies/filter?sort_by=date&type=1&items_per_page=30&page=0', // Movies Latest
    '/movies/filter?sort_by=date&type=1&items_per_page=30&page=1', // Movies Latest Page 1
    '/movies/filter?sort_by=date&type=2&items_per_page=30&page=0', // TV Shows Latest
    '/movies/filter?sort_by=date&type=2&items_per_page=30&page=1', // TV Shows Latest Page 1
    '/movies/filter?dubbing=Hindi&items_per_page=30&page=0',       // Hindi filter
  ];

  Promise.all(warmupEndpoints.map(endpoint =>
    catalogCache.get(endpoint).then(({ status }) => {
      console.log(`[Warmup] Preloaded: ${endpoint} (${status})`);
    }).catch(err => {
      console.error(`[Warmup] Failed: ${endpoint}:`, err.message);
    })
  ));
});
