const axios = require('axios');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://netmirror.global/'
};

axios.get('https://api2.imdb3.shop/api/movies/filter?sort_by=date&dubbing=Hindi&items_per_page=30&page=0', { headers }).then(res => {
  console.log('STATUS:', res.status);
  console.log('DATA keys:', Object.keys(res.data));
  console.log('RESULTS count:', res.data.results ? res.data.results.length : 'no results');
  if (res.data.results && res.data.results.length > 0) {
    console.log('First Item:', res.data.results[0]);
  }
}).catch(err => {
  console.error(err.message);
});
