const axios = require('axios');
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://netmirror.center/',
  'Origin': 'https://netmirror.center'
};
axios.get('https://netmirror.center/movie/103375', { headers })
  .then(res => {
    const data = res.data;
    if (data.results && data.results.length > 0) {
      console.log('Results keys:', Object.keys(data.results[0]).join(', '));
      if (data.results[0].similar) {
         console.log('Similar found!');
      } else {
         console.log('No similar in results[0]');
      }
    } else {
      console.log('Keys in data:', Object.keys(data).join(', '));
      console.log('Data:', JSON.stringify(data).substring(0, 500));
    }
  })
  .catch(console.error);
