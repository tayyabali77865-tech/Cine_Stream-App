const axios = require('axios');
axios.get('https://netmirror.global/movie/103375', {
  headers: {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'https://netmirror.center/'
  }
}).then(res => console.log(Object.keys(res.data.results ? res.data.results[0] : res.data)))
.catch(err => console.error(err.response ? err.response.status : err.message));
