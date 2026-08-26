const axios = require('axios');

async function test() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://netmirror.center/',
    'Origin': 'https://netmirror.center',
  };

  const queries = ['Moana', 'Demon Slayer', 'Evil'];
  const base = 'https://api2.imdb4.shop/api';

  for (const q of queries) {
    // Let's encode spaces as '+'
    const formatted = encodeURIComponent(q.trim()).replace(/%20/g, '+');
    const url = `${base}/search2/${formatted}?page=0`;
    try {
      console.log(`Requesting search for "${q}" -> URL: ${url}`);
      const res = await axios.get(url, { headers, timeout: 5000 });
      console.log(`  Status: ${res.status}`);
      const results = res.data.results || [];
      console.log(`  Number of results: ${results.length}`);
      if (results.length > 0) {
        console.log(`  First result: ${results[0].title} (ID: ${results[0].id})`);
      } else {
        console.log(`  Data response:`, JSON.stringify(res.data));
      }
    } catch (e) {
      console.log(`  Error searching "${q}":`, e.message);
    }
  }
}

test();
