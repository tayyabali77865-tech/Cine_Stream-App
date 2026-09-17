const axios = require('axios');
axios.get('https://netmirror.global/', {
  headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
}).then(res => {
  const html = res.data;
  const matches = html.match(/assets\/index-[a-zA-Z0-9]+\.js/g);
  console.log('JS bundles found:', matches ? [...new Set(matches)] : 'none');
});
