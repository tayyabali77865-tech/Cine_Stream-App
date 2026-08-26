const axios = require('axios');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Referer': 'https://fmoviesunblocked.net/'
};

async function test() {
  const url = `https://api2.imdb3.shop/api/tranding?id=25&page=0`;
  try {
    const res = await axios.get(url, { headers });
    console.log(`Status: ${res.status}`);
    const results = res.data.results || [];
    console.log(`Found ${results.length} items.`);
    results.slice(0, 5).forEach(item => {
      console.log(`- ${item.title} (Type: ${item.media_type || item.type})`);
    });
  } catch (e) {
    console.error('Failed:', e.message);
  }
}

test();
