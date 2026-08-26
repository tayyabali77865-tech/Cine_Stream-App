const axios = require('axios');

async function testAll() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://netmirror.center/',
    'Origin': 'https://netmirror.center',
  };

  const mirrors = [
    'https://api2.imdb3.shop/api',
    'https://api2.imdb4.shop/api',
    'https://api2.imdb1.shop/api',
    'https://api2.imdb2.shop/api'
  ];

  for (const mirror of mirrors) {
    console.log(`--- Testing Mirror: ${mirror} ---`);
    for (const q of ['Moana', 'Demon Slayer']) {
      const formatted = encodeURIComponent(q.trim()).replace(/%20/g, '+');
      const url = `${mirror}/search2/${formatted}?page=0`;
      try {
        const res = await axios.get(url, { headers, timeout: 5000 });
        if (res.data && res.data.results) {
          console.log(`  Query "${q}": SUCCESS! Found ${res.data.results.length} results.`);
        } else {
          console.log(`  Query "${q}": FAILED/BLOCKED. Response:`, JSON.stringify(res.data));
        }
      } catch (err) {
        console.log(`  Query "${q}": ERROR. Message: ${err.message}`);
      }
    }
  }
}

testAll();
