require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { 
  DynamicMirrorManager, 
  CircuitBreaker, 
  RequestDeduplicator, 
  LRUCacheWithSWR 
} = require('./services/cacheService');

const app = express();
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
  fetchFn: async (key) => {
    return fetchFromNetmirrorWithRetry(key);
  }
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: '*', // Adjust production CORS rules if needed
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Signature', 'X-Timestamp']
}));
app.use(express.json());

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

// HMAC Request Signature Authentication Middleware (Protecting all endpoints except /api/health)
app.use((req, res, next) => {
  if (req.path === '/api/health') {
    return next();
  }

  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];

  if (!signature || !timestamp) {
    return res.status(401).json({ error: 'Unauthorized: Missing signature or timestamp.' });
  }

  // 1. Verify timestamp is fresh (within 60 seconds to prevent replay attacks)
  const now = Date.now();
  const reqTime = parseInt(timestamp, 10);
  if (isNaN(reqTime) || Math.abs(now - reqTime) > 60000) {
    return res.status(403).json({ error: 'Forbidden: Request has expired or clock is out of sync.' });
  }

  // 2. Re-calculate signature
  const secretKey = process.env.API_KEY || 'cinestream_secret_secure_key_2026';
  const dataToSign = req.originalUrl + timestamp;
  const expectedSignature = crypto.createHmac('sha256', secretKey).update(dataToSign).digest('hex');

  if (signature !== expectedSignature) {
    return res.status(403).json({ error: 'Forbidden: Invalid API signature.' });
  }

  next();
});

const REFERER_URL = 'https://fmoviesunblocked.net/';
const HM_SECRET = 'net###@@sss';

const getHeaders = (referer = REFERER_URL) => ({
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
});

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
          timeout: 4000
        });

        if (res.data && (res.data.results || res.data.filters)) {
          circuitBreaker.success();
          return res.data;
        }
        
        throw new Error('Invalid response structure from NetMirror.');
      } catch (err) {
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
  const page = req.query.page || 0;
  const filter = req.query.filter || 'Latest';
  const category = req.query.category || 'All';
  const cacheKey = `${category}_${filter}_${page}`;
  
  try {
    let queryParams = 'sort_by=date&dubbing=Hindi';
    
    if (filter === 'Trending') {
      queryParams = 'sort_by=date&dubbing=Hindi';
    } else if (filter === 'Hollywood') {
      queryParams = 'sort_by=date&dubbing=Hindi&countryNotParam=india&countryNot=Nigeria&countryNot2=Philippines';
    } else if (filter === 'Bollywood') {
      queryParams = 'sort_by=date&dubbing=Hindi&country=india';
    } else if (filter === 'Korean') {
      queryParams = 'sort_by=date&country=Korea';
    } else if (filter === 'Chinese') {
      queryParams = 'sort_by=date&country=China';
    } else if (filter === 'South Indian') {
      queryParams = 'sort_by=date&dubbing=Tamil';
    }

    if (category === 'Anime') {
      const endpoint = `/movies/filter?sort_by=date&country=Japan&items_per_page=30&page=${page}`;
      const { value: data, status } = await catalogCache.get(endpoint);
      const results = data.results || [];
      const mediaList = results.map(item => ({
        id: item.id,
        title: item.title ? item.title.trim() : 'Unknown Title',
        poster: item.backdrop_path || 'https://placehold.co/300x450',
        type: item.media_type === 'tv' ? 'TV Show' : 'Movie',
        releaseDate: item.release_date || 'N/A',
        country: item.cn || '',
        channel: item.channel || '',
        rating: parseFloat(item.vote_average) || 0
      }));
      
      res.setHeader('X-Cache-Status', status);
      return res.json(mediaList);
    }

    if (category === 'Movies') {
      queryParams += '&type=1';
    } else if (category === 'Series') {
      queryParams += '&type=2';
    }
    
    const endpoint = `/movies/filter?${queryParams}&items_per_page=30&page=${page}`;
    const { value: data, status } = await catalogCache.get(endpoint);
    const results = data.results || [];
    
    const mediaList = results.map(item => ({
      id: item.id,
      title: item.title ? item.title.trim() : 'Unknown Title',
      poster: item.backdrop_path || 'https://placehold.co/300x450',
      type: item.media_type === 'tv' ? 'TV Show' : 'Movie',
      releaseDate: item.release_date || 'N/A',
      country: item.cn || '',
      channel: item.channel || '',
      rating: parseFloat(item.vote_average) || 0
    }));

    res.setHeader('X-Cache-Status', status);
    res.json(mediaList);
  } catch (error) {
    console.error('Error fetching trending list:', error.message);
    res.status(500).json({ error: 'Failed to retrieve netmirror catalog.' });
  }
});

/**
 * 2. Search Media (Not cached as searches are dynamic and unique, but using the resilient fetcher)
 */
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const page = req.query.page || 0;
  if (!query) return res.json([]);
  
  try {
    const formattedQuery = encodeURIComponent(query.trim()).replace(/%20/g, '+');
    const endpoint = `/search2/${formattedQuery}?page=${page}`;
    const data = await fetchFromNetmirrorWithRetry(endpoint);
    const results = data.results || [];
    
    const mediaList = results.map(item => ({
      id: item.id,
      title: item.title ? item.title.trim() : 'Unknown Title',
      poster: item.backdrop_path || 'https://placehold.co/300x450',
      type: item.media_type === 'tv' ? 'TV Show' : 'Movie',
      releaseDate: item.release_date || 'N/A',
      country: item.cn || '',
      channel: item.channel || '',
      rating: parseFloat(item.vote_average) || 0
    }));

    res.json(mediaList);
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

    res.setHeader('X-Cache-Status', status);
    res.json({
      id: item.id,
      title: item.title ? item.title.trim() : 'Unknown Title',
      description: item.dis || 'No description available.',
      poster: item.backdrop_path || 'https://placehold.co/300x450',
      type: item.media_type === 'tv' ? 'TV Show' : 'Movie',
      seasons: item.season || null,
      audioLanguages: alternateDubs,
    });
  } catch (error) {
    console.error(`Error fetching details for ID ${id}:`, error.message);
    res.status(500).json({ error: 'Failed to retrieve movie details.' });
  }
});

/**
 * 4. Advanced Stream Resolver
 */
app.get('/api/stream/:id', async (req, res) => {
  const { id } = req.params;
  const se = req.query.season || '1';
  const ep = req.query.episode || '1';
  const lang = req.query.lang || 'Hindi';
  
  try {
    console.log(`📡 Resolving stream for ID: ${id} (Season ${se}, Episode ${ep}, Lang ${lang})`);
    
    const endpoint = `/movie/${id}`;
    const { value: detailsData } = await detailsCache.get(endpoint);
    const results = detailsData.results || [];
    if (results.length === 0) {
      throw new Error('Movie metadata not found.');
    }
    let item = results[0];

    let resolvedVideoUrl = null;
    let targetId = id;

    // alternate language handling
    if (lang !== 'Hindi') {
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

    let targetSe = se;
    let targetEp = ep;
    if (item.media_type !== 'tv' || !item.season || (Array.isArray(item.season) && item.season.length === 0)) {
      targetSe = '';
      targetEp = '';
      console.log(`🎬 Target item is classified as Movie/Single release. Clearing season/episode parameters.`);
    }

    // Try Scenario 1 (direct embed resolver)
    if (item.embed) {
      const rawEmbedUrl = item.embed;
      const urlParamMatch = rawEmbedUrl.match(/url=([^&]+)/);
      if (urlParamMatch) {
        const decodedUrl = Buffer.from(urlParamMatch[1], 'base64').toString('ascii');
        console.log(`🔓 Decoded Embed Host URL: ${decodedUrl}`);
        resolvedVideoUrl = await extractDirectVideoLink(decodedUrl);
      }
    }

    // Try Scenario 2 (Watchbox resolver with signatures)
    if (!resolvedVideoUrl && item.dp) {
      const dp = item.dp;
      const titleClean = item.title ? item.title.trim() : 'Video';
      const na = Buffer.from(titleClean).toString('base64');
      resolvedVideoUrl = await resolveWatchboxStream(targetId, targetSe, targetEp, dp, na);
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
              
              if (altItemMeta.embed) {
                const rawEmbedUrl = altItemMeta.embed;
                const urlParamMatch = rawEmbedUrl.match(/url=([^&]+)/);
                if (urlParamMatch) {
                  const decodedUrl = Buffer.from(urlParamMatch[1], 'base64').toString('ascii');
                  resolvedVideoUrl = await extractDirectVideoLink(decodedUrl);
                }
              }
              
              if (!resolvedVideoUrl && altItemMeta.dp) {
                const altNa = Buffer.from(altItemMeta.title ? altItemMeta.title.trim() : 'Video').toString('base64');
                resolvedVideoUrl = await resolveWatchboxStream(altItem.id, targetSe, targetEp, altItemMeta.dp, altNa);
              }
              
              if (resolvedVideoUrl) {
                console.log(`🔥 Recovery SUCCESS! Using stream from alternate ID ${altItem.id}`);
                break;
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

    console.log(`🔥 Resolved final streaming file: ${resolvedVideoUrl}`);
    res.json({
      videoUrl: resolvedVideoUrl,
      audioUrl: null,
      referer: REFERER_URL
    });
  } catch (error) {
    console.error(`Error resolving stream for ID ${id}:`, error.message);
    res.status(500).json({ error: 'Failed to resolve streaming file.' });
  }
});

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
 * Syncs time and generates dynamic HMAC signatures to unlock watchbox player streams
 */
async function resolveWatchboxStream(id, se, ep, dp, na) {
  const WATCHBOX_DOMAINS = [
    'speed.watch22.shop',
    'play.watch22.shop',
    'play.watch21.shop',
    'test.watch22.shop',
    'playnew.watch21.shop'
  ];
  const netmirrorReferer = 'https://netmirror.global/';

  console.log(`⚡ Concurrently resolving watchbox streams across ${WATCHBOX_DOMAINS.length} domains...`);

  const promises = WATCHBOX_DOMAINS.map(async (domain) => {
    try {
      const watchboxBaseUrl = `https://${domain}/play/watchbox.php?id=${id}&se=${se}&ep=${ep}&dp=${dp}&na=${encodeURIComponent(na)}&exten=1`;
      const dummyUrl = `${watchboxBaseUrl}&ts=0&sig=0`;
      
      const dummyRes = await axios.get(dummyUrl, { 
        headers: getHeaders(netmirrorReferer),
        timeout: 2500
      });
      
      let serverTime = null;
      const timeMatch = dummyRes.data.match(/Time not Found\.<br><br>(\d+)/);
      let htmlContent = '';
      
      if (timeMatch) {
        serverTime = timeMatch[1];
        const signature = crypto.createHmac('sha256', HM_SECRET).update(String(serverTime)).digest('hex');
        const authUrl = `${watchboxBaseUrl}&ts=${serverTime}&sig=${signature}`;
        
        const authRes = await axios.get(authUrl, { 
          headers: getHeaders(netmirrorReferer),
          timeout: 3000
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
        console.log(`[Watchbox] Fast resolution SUCCESS on domain: ${domain}`);
        return resolvedUrl;
      }
      throw new Error(`Domain ${domain} failed parsing HTML.`);
    } catch (err) {
      throw err;
    }
  });

  try {
    const firstSuccessfulUrl = await Promise.any(promises);
    return firstSuccessfulUrl;
  } catch (aggregateError) {
    console.log('❌ All concurrent watchbox servers failed resolving links.');
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

  return null;
}

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
    circuitBreaker: circuitBreaker.getState(),
    catalogCache: catalogCache.getMetrics(),
    detailsCache: detailsCache.getMetrics(),
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
}, 60000);

// Server Listen
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n🚀 Production Scraper Server active on http://0.0.0.0:${PORT}/api`);
  
  // Start Mirror discovery
  await mirrorManager.start();

  // Background Warmup
  console.log('[Warmup] Initializing background cache pre-fetch...');
  const warmupEndpoints = [
    '/movies/filter?sort_by=date&dubbing=Hindi&items_per_page=30&page=0', // Latest All Page 0
    '/movies/filter?sort_by=date&country=Japan&items_per_page=30&page=0', // Anime Page 0
    '/movies/filter?sort_by=date&dubbing=Hindi&type=1&items_per_page=30&page=0', // Movies Latest
    '/movies/filter?sort_by=date&dubbing=Hindi&type=2&items_per_page=30&page=0'  // TV Shows Latest
  ];

  for (const endpoint of warmupEndpoints) {
    catalogCache.get(endpoint).then(({ status }) => {
      console.log(`[Warmup] Successfully preloaded: ${endpoint} (Status: ${status})`);
    }).catch(err => {
      console.error(`[Warmup] Preload failed for ${endpoint}:`, err.message);
    });
  }
});
