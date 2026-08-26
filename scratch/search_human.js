const axios = require('axios');

async function search() {
  const mirrors = [
    'https://api2.imdb3.shop/api',
    'https://api2.imdb4.shop/api'
  ];

  for (const api of mirrors) {
    try {
      console.log(`Searching "human" on ${api}...`);
      const res = await axios.get(`${api}/search2/human?page=0`);
      const results = res.data.results || [];
      console.log(`  Results count: ${results.length}`);
      for (const r of results.slice(0, 10)) {
        console.log(`  - ID: ${r.id}, Title: ${r.title}, Type: ${r.media_type}, CN: ${r.cn}`);
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }
}

search();
