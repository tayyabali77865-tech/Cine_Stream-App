const cron = require('node-cron');
const Media = require('../models/Media');
const MediaList = require('../models/MediaList');

/**
 * Service to scrape upstream data and save it into MongoDB
 */
class ScraperService {
  constructor(fetchUpstreamData, fetchUpstreamDetails) {
    this.fetchUpstreamData = fetchUpstreamData;
    this.fetchUpstreamDetails = fetchUpstreamDetails;
    this.isScrapingCatalog = false;
    this.isScrapingLinks = false;
    
    // Categories and filters to scrape
    this.categories = [
      { category: 'All', filters: ['Trending', 'Latest', 'Hollywood', 'Bollywood', 'Korean', 'Chinese', 'South Indian'] },
      { category: 'Movies', filters: ['Trending', 'Latest', 'Hollywood', 'Bollywood', 'Korean', 'Chinese', 'South Indian'] },
      { category: 'Series', filters: ['Trending', 'Latest', 'Hollywood', 'Bollywood', 'Korean', 'Chinese', 'South Indian'] },
      { category: 'Anime', filters: ['Trending', 'Latest', 'Hindi', 'English'] },
    ];
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Syncs the entire catalog metadata (cards) from upstream.
   */
  async syncCatalog() {
    if (this.isScrapingCatalog) {
      console.log('[Scraper] Catalog sync already in progress. Skipping.');
      return;
    }
    
    console.log('[Scraper] Starting catalog sync...');
    this.isScrapingCatalog = true;

    try {
      for (const catObj of this.categories) {
        const { category, filters } = catObj;
        
        for (const filter of filters) {
          let page = 0;
          let hasMore = true;
          let listItems = [];
          
          while (hasMore) {
            console.log(`[Scraper] Fetching Catalog: ${category} -> ${filter} (Page ${page})`);
            
            try {
              let endpoint = '';
              let customEndpoint = null;
              let queryParams = 'sort_by=date';

              if (filter === 'Trending' && category !== 'Anime') {
                endpoint = `/tranding?id=11&page=${page}`;
              } else if (category === 'Anime') {
                queryParams = 'genre_ids[]=10&genre_ids[]=6';
                if (filter === 'Hindi') queryParams += '&dubbing=Hindi';
                else if (filter === 'English') queryParams += '&dubbing=English';
                endpoint = `/movies/filter?${queryParams}&items_per_page=30&page=${page}`;
              } else if (category === 'Series') {
                if (filter === 'Hindi') queryParams = 'type=2&dubbing=Hindi';
                else if (filter === 'English') queryParams = 'type=2&dubbing=English';
                else if (filter === 'Bollywood') queryParams = 'type=2&country=india&dubbing=Hindi';
                else if (filter === 'Hollywood') queryParams = 'type=2&country=United+States&sort_by=date';
                else if (filter === 'Korean') queryParams = 'type=2&country=Korea';
                else if (filter === 'Chinese') queryParams = 'type=2&country=China';
                else if (filter === 'South Indian') queryParams = 'type=2&country=india';
                else queryParams = 'type=2&sort_by=date';
              } else if (category === 'Movies') {
                if (filter === 'Hindi') queryParams = 'type=1&dubbing=Hindi';
                else if (filter === 'English') queryParams = 'type=1&dubbing=English';
                else if (filter === 'Bollywood') queryParams = 'type=1&country=india&dubbing=Hindi';
                else if (filter === 'Hollywood') queryParams = 'type=1&countryNotParam=india&countryNot=Nigeria&countryNot2=Philippines';
                else if (filter === 'Korean') queryParams = 'type=1&country=Korea';
                else if (filter === 'Chinese') queryParams = 'type=1&country=China';
                else if (filter === 'South Indian') queryParams = 'type=1&country=india';
                else queryParams = 'type=1&sort_by=date';
              } else {
                // All category
                if (filter === 'Hindi') queryParams = 'dubbing=Hindi';
                else if (filter === 'English') queryParams = 'dubbing=English';
                else if (filter === 'Bollywood') queryParams = 'country=India&sort_by=date';
                else if (filter === 'Hollywood') queryParams = 'country=United+States&sort_by=date';
                else if (filter === 'Korean') queryParams = 'country=Korea&sort_by=date';
                else if (filter === 'Chinese') queryParams = 'country=China&sort_by=date';
                else if (filter === 'South Indian') customEndpoint = `/tranding?id=15&page=${page}`;
                else queryParams = 'dubbing=Hindi&sort_by=date';
              }

              if (!endpoint) {
                endpoint = customEndpoint || `/movies/filter?${queryParams}&items_per_page=30&page=${page}`;
              }

              const data = await this.fetchUpstreamData(endpoint);
              const results = data.results || [];
              
              if (results.length === 0) {
                hasMore = false;
                break;
              }

              // Save to MongoDB
              for (const item of results) {
                // Determine item type based on proxy logic
                let itemType = 'Movie';
                const typeLower = (item.media_type || item.type || '').toLowerCase();
                if (typeLower === 'tv' || typeLower === 'tv show' || typeLower === 'series') itemType = 'TV Show';
                
                await Media.findOneAndUpdate(
                  { id: String(item.id) },
                  {
                    $set: {
                      title: item.title,
                      poster: item.poster,
                      backdrop_path: item.backdrop_path,
                      type: itemType,
                      rating: item.rating,
                      releaseDate: item.releaseDate || item.release_date,
                      country: item.country || item.cn,
                      badge: item.badge
                    },
                    $addToSet: {
                      categories: category,
                      filters: filter
                    }
                  },
                  { upsert: true, returnDocument: 'after' }
                );
              }
              
              listItems.push(...results.map(i => String(i.id)));

              page++;
              // Be gentle to upstream server
              await this.delay(1000); 

            } catch (err) {
              console.error(`[Scraper] Error fetching catalog page ${page} for ${category}/${filter}:`, err.message);
              hasMore = false; // Stop this category/filter on error
            }
          }
          
          // Save the ordered list of IDs to database
          if (listItems.length > 0) {
            await MediaList.findOneAndUpdate(
              { category, filter },
              { $set: { items: listItems, lastUpdated: Date.now() } },
              { upsert: true }
            );
          }
        }
      }
      
      console.log('[Scraper] Catalog sync completed successfully.');
    } catch (err) {
      console.error('[Scraper] Catalog sync failed:', err);
    } finally {
      this.isScrapingCatalog = false;
    }
  }

  startCronJob() {
    console.log('[Scraper] Registering 24-hour cron jobs...');
    
    // Run catalog sync every 24 hours to refresh cards/metadata
    cron.schedule('0 0 * * *', () => {
      this.syncCatalog();
    });
    
    console.log('[Scraper] Cron jobs registered successfully.');
  }
}

module.exports = ScraperService;
