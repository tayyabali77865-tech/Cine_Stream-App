const axios = require('axios');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://netmirror.global/'
};

axios.get('https://api2.imdb3.shop/api/movies/filter?sort_by=date&genres%5B%5D=16&items_per_page=30&page=0', { headers }).then(res => {
  const results = res.data.results || [];
  console.log('Results count:', results.length);
  if (results.length > 0) {
    console.log('First 5 items:');
    results.slice(0, 5).forEach(item => {
      console.log(`- ${item.title} (CN: ${item.cn}, Genres: ${item.genres || JSON.stringify(item.genre)})`);
    });
  }
}).catch(err => {
  console.error(err.message);
});
