const axios = require('axios');
const cheerio = require('cheerio');

class DynamicMirrorManager {
  constructor({ defaultMirrors, netmirrorHomeUrl, checkIntervalMs }) {
    this.mirrors = [...defaultMirrors];
    this.netmirrorHomeUrl = netmirrorHomeUrl || 'https://netmirror.global/';
    this.checkIntervalMs = checkIntervalMs || 300000; // 5 minutes
    this.activeMirror = defaultMirrors[0];
    this.sortedMirrors = [...defaultMirrors];
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://fmoviesunblocked.net/'
    };
    this.intervalId = null;
  }

  async start() {
    console.log('[MirrorManager] Starting mirror manager...');
    await this.discoverAndTestMirrors();
    this.intervalId = setInterval(() => {
      this.discoverAndTestMirrors().catch(err => {
        console.error('[MirrorManager] Background mirror update failed:', err.message);
      });
    }, this.checkIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async discoverAndTestMirrors() {
    try {
      console.log('[MirrorManager] Scraping NetMirror home to discover mirrors...');
      const res = await axios.get(this.netmirrorHomeUrl, { headers: this.headers, timeout: 5000 });
      const html = res.data;
      const $ = cheerio.load(html);
      
      let scriptSrc = '';
      $('script').each((i, el) => {
        const src = $(el).attr('src');
        if (src && src.includes('/assets/index-')) {
          scriptSrc = src;
        }
      });

      if (scriptSrc) {
        const scriptUrl = scriptSrc.startsWith('http') ? scriptSrc : `${this.netmirrorHomeUrl.replace(/\/$/, '')}${scriptSrc}`;
        console.log(`[MirrorManager] Found JS Bundle: ${scriptUrl}`);
        
        const scriptRes = await axios.get(scriptUrl, { headers: this.headers, timeout: 5000 });
        const code = scriptRes.data;
        
        const mirrorRegex = /(https?:\/\/api2\.[a-zA-Z0-9.-]+\.shop\/api)/g;
        let match;
        const newMirrors = new Set();
        while ((match = mirrorRegex.exec(code)) !== null) {
          newMirrors.add(match[1]);
        }

        if (newMirrors.size > 0) {
          this.mirrors = [...newMirrors];
          console.log('[MirrorManager] Discovered active mirror domains:', this.mirrors);
        }
      }
    } catch (err) {
      console.warn('[MirrorManager] Failed to dynamically scrape mirrors, using existing list:', err.message);
    }

    await this.testMirrors();
  }

  async testMirrors() {
    const tested = [];
    for (const mirror of this.mirrors) {
      const start = Date.now();
      try {
        // Test basic filtering endpoint (Relaxed timeout to 4000ms)
        await axios.get(`${mirror}/movies/filter?sort_by=date&items_per_page=1&page=0`, {
          headers: this.headers,
          timeout: 4000
        });
        
        // Test search endpoint availability (Relaxed timeout to 4000ms)
        const searchRes = await axios.get(`${mirror}/search2/a?page=0`, {
          headers: this.headers,
          timeout: 4000
        });

        // Simply check if response exists and has a results property array
        if (!searchRes.data || !Array.isArray(searchRes.data.results)) {
          throw new Error('Invalid search response format.');
        }

        const latency = Date.now() - start;
        tested.push({ mirror, latency, online: true });
      } catch (err) {
        tested.push({ mirror, latency: Infinity, online: false });
      }
    }

    const sorted = tested
      .filter(t => t.online)
      .sort((a, b) => a.latency - b.latency)
      .map(t => t.mirror);

    if (sorted.length > 0) {
      this.sortedMirrors = sorted;
      this.activeMirror = sorted[0];
      console.log(`[MirrorManager] Sorted mirrors by latency:`, tested);
      console.log(`[MirrorManager] Active primary mirror selected: ${this.activeMirror}`);
    } else {
      console.warn('[MirrorManager] No mirrors are currently online! Falling back to first default mirror.');
      this.activeMirror = this.mirrors[0];
    }
  }

  getActiveMirror() {
    return this.activeMirror;
  }

  getMirrors() {
    return this.sortedMirrors.length > 0 ? this.sortedMirrors : this.mirrors;
  }

  rotateMirror() {
    const mirrors = this.getMirrors();
    const idx = mirrors.indexOf(this.activeMirror);
    if (idx !== -1 && mirrors.length > 1) {
      this.activeMirror = mirrors[(idx + 1) % mirrors.length];
      console.log(`[MirrorManager] Rotated mirror. New active mirror: ${this.activeMirror}`);
    }
  }
}

class CircuitBreaker {
  constructor({ threshold = 20, resetMs = 30000 }) {
    this.threshold = threshold;
    this.resetMs = resetMs;
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.nextAttemptAt = 0;
  }

  allow() {
    if (this.state === 'OPEN') {
      if (Date.now() > this.nextAttemptAt) {
        this.state = 'HALF-OPEN';
        console.log('[CircuitBreaker] Entering HALF-OPEN state, checking recovery...');
        return true;
      }
      return false;
    }
    return true;
  }

  success() {
    if (this.state === 'HALF-OPEN') {
      this.successes++;
      if (this.successes >= 3) {
        this.state = 'CLOSED';
        this.failures = 0;
        this.successes = 0;
        console.log('[CircuitBreaker] Circuit restored to CLOSED state.');
      }
    } else {
      this.failures = 0;
    }
  }

  failure() {
    this.failures++;
    console.log(`[CircuitBreaker] Failure recorded. Count: ${this.failures}/${this.threshold}`);
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttemptAt = Date.now() + this.resetMs;
      console.warn(`[CircuitBreaker] Circuit tripped to OPEN state. Resting for ${this.resetMs}ms`);
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      threshold: this.threshold
    };
  }
}

class RequestDeduplicator {
  constructor() {
    this.pending = new Map();
  }

  async execute(key, fn) {
    if (this.pending.has(key)) {
      console.log(`[Deduplicator] Coalescing request for key: ${key}`);
      return this.pending.get(key);
    }

    const promise = fn().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, promise);
    return promise;
  }
}

class LRUCacheWithSWR {
  constructor({ capacity, ttlMs, swrMs, fetchFn }) {
    this.capacity = capacity;
    this.ttlMs = ttlMs;
    this.swrMs = swrMs;
    this.fetchFn = fetchFn;
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
    this.refreshes = 0;
    this.evictions = 0;
  }

  async get(key, ...args) {
    const now = Date.now();
    const entry = this.cache.get(key);

    if (entry) {
      this.cache.delete(key);
      this.cache.set(key, entry);

      const age = now - entry.fetchedAt;

      if (age < this.ttlMs) {
        this.hits++;
        return { value: entry.value, status: 'HIT' };
      } else if (age < this.ttlMs + this.swrMs) {
        this.hits++;
        if (!entry.isRefreshing) {
          entry.isRefreshing = true;
          this.refreshes++;
          console.log(`[Cache] SWR background refresh for: ${key}`);
          this.fetchFn(key, ...args)
            .then((newValue) => {
              if (newValue !== null && newValue !== undefined) {
                this.set(key, newValue);
              }
            })
            .catch((err) => {
              console.error(`[Cache] Background refresh failed for: ${key}`, err.message);
            })
            .finally(() => {
              const updatedEntry = this.cache.get(key);
              if (updatedEntry) {
                updatedEntry.isRefreshing = false;
              }
            });
        }
        return { value: entry.value, status: 'SWR_HIT' };
      }
    }

    this.misses++;
    try {
      const newValue = await this.fetchFn(key, ...args);
      if (newValue !== null && newValue !== undefined) {
        this.set(key, newValue);
      }
      return { value: newValue, status: 'MISS' };
    } catch (err) {
      if (entry) {
        console.warn(`[Cache] Fetch failed for ${key}, falling back to expired/stale cache entry.`);
        return { value: entry.value, status: 'FALLBACK_HIT' };
      }
      throw err;
    }
  }

  set(key, value) {
    if (this.cache.size >= this.capacity && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.evictions++;
      console.log(`[Cache] LRU Evicted oldest key: ${oldestKey}`);
    }
    this.cache.set(key, {
      value,
      fetchedAt: Date.now(),
      isRefreshing: false
    });
  }

  cleanupExpired() {
    const now = Date.now();
    const maxAge = this.ttlMs + this.swrMs;
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.fetchedAt > maxAge) {
        this.cache.delete(key);
        console.log(`[Cache] Cleaned up expired key: ${key}`);
      }
    }
  }

  getMetrics() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? ((this.hits / total) * 100).toFixed(2) + '%' : '0.00%';
    return {
      size: this.cache.size,
      capacity: this.capacity,
      hits: this.hits,
      misses: this.misses,
      refreshes: this.refreshes,
      evictions: this.evictions,
      hitRate
    };
  }
}

module.exports = {
  DynamicMirrorManager,
  CircuitBreaker,
  RequestDeduplicator,
  LRUCacheWithSWR
};
