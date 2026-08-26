const axios = require('axios');

async function run() {
  const ids = ['122801', '122804', '122805', '122806', '122899'];
  for (const id of ids) {
    try {
      const res = await axios.get(`https://api2.imdb3.shop/api/movie/${id}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://netmirror.global/'
        },
        timeout: 4000
      });
      console.log(`✅ Success for ${id} on imdb3.shop! Results count:`, res.data.results ? res.data.results.length : 'no results');
    } catch (err) {
      console.log(`❌ Failed for ${id} on imdb3.shop:`, err.response ? err.response.status : err.message);
    }
  }
}

run();
