const axios = require('axios');

async function run() {
  const url = 'https://netmirror.center/movie/122801';
  try {
    console.log('Fetching details HTML from netmirror.center...');
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://netmirror.center/'
      },
      timeout: 5000
    });
    console.log('Status:', res.status);
    console.log('HTML Length:', res.data.length);
    console.log('Contains embed_json?', res.data.includes('embed_json') || res.data.includes('window.__') || res.data.includes('item'));
  } catch (err) {
    console.error('Failed:', err.response ? err.response.status + ' ' + JSON.stringify(err.response.data) : err.message);
  }
}

run();
