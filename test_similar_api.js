const axios = require('axios');
const id = '3891';

async function testEndpoints() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://netmirror.center/',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json'
  };

  const endpoints = [
    `https://netmirror.center/similar/${id}`,
    `https://netmirror.center/api/similar/${id}`,
    `https://netmirror.center/related/${id}`,
    `https://netmirror.center/movie/similar/${id}`,
    `https://netmirror.center/tv/similar/${id}`,
    `https://netmirror.center/tv/${id}`
  ];

  for (const ep of endpoints) {
    try {
      console.log('Testing', ep);
      const res = await axios.get(ep, { headers, timeout: 5000 });
      console.log('Success!', typeof res.data, Array.isArray(res.data) ? res.data.length : Object.keys(res.data));
    } catch (e) {
      console.log('Failed:', e.response ? e.response.status : e.message);
    }
  }
}
testEndpoints();
