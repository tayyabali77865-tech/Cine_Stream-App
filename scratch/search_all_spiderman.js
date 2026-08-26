const axios = require('axios');

const getHeaders = (referer = 'https://netmirror.center/') => ({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': referer,
  'Origin': 'https://netmirror.center'
});

async function run() {
  const query = 'Spider+Man+Brand+New+Day';
  // Try search on api2.imdb4.shop/api
  try {
    const res = await axios.get(`https://api2.imdb4.shop/api/search2/${query}?page=0`, { headers: getHeaders() });
    console.log('Results from imdb4:', res.data.results ? res.data.results.map(r => ({ id: r.id, title: r.title })) : res.data);
  } catch (err) {
    console.error('imdb4 failed:', err.message);
  }
}

run();
