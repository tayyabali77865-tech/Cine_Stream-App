const axios = require('axios');

async function test() {
  const filters = ['Hollywood', 'Bollywood', 'Korean', 'Chinese', 'South Indian'];
  
  for (const f of filters) {
    let q = 'sort_by=date&country=' + encodeURIComponent(f);
    if (f === 'South Indian') {
      q = 'sort_by=date&country=South+Indian';
    }
    const url = `https://api2.imdb3.shop/api/movies/filter?${q}&items_per_page=10&page=0`;
    try {
      const res = await axios.get(url);
      const results = res.data.results || [];
      console.log(`\n--- Results for Filter: ${f} ---`);
      results.forEach(item => {
        console.log(`- ${item.title} (Country: ${item.country}, Lang: ${item.dubbing})`);
      });
    } catch (e) {
      console.error(`Failed for ${f}:`, e.message);
    }
  }
}

test();
