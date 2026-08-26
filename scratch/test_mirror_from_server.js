const axios = require('axios');

async function run() {
  const url = 'https://api2.imdb4.shop/api/movie/122804';
  try {
    console.log('Fetching details from api2.imdb4.shop...');
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://netmirror.global/'
      },
      timeout: 5000
    });
    console.log('Status:', res.status);
    console.log('Data:', JSON.stringify(res.data).substring(0, 500));
  } catch (err) {
    console.error('Failed:', err.response ? err.response.status + ' ' + JSON.stringify(err.response.data) : err.message);
  }
}

run();
