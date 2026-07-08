const axios = require('axios');

async function test() {
  const filterQueries = {
    'Hollywood': 'sort_by=date&dubbing=Hindi&countryNotParam=india&countryNot=Nigeria&countryNot2=Philippines',
    'Bollywood': 'sort_by=date&dubbing=Hindi&country=india',
    'Korean': 'sort_by=date&country=Korea',
    'Chinese': 'sort_by=date&country=China',
    'South Indian': 'sort_by=date&dubbing=Tamil' // Or we can test dubbing=Telugu
  };
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Referer': 'https://fmoviesunblocked.net/'
  };

  for (const [name, q] of Object.entries(filterQueries)) {
    const url = `https://api2.imdb3.shop/api/movies/filter?${q}&items_per_page=30&page=0`;
    try {
      const res = await axios.get(url, { headers });
      const results = res.data.results || [];
      console.log(`\n--- Results for ${name} ---`);
      results.slice(0, 5).forEach(item => {
        console.log(`- ${item.title} (Country: ${item.country || item.cn}, Dubbing: ${item.dubbing})`);
      });
    } catch (e) {
      console.error(`Failed for ${name}:`, e.message);
    }
  }
}

test();
