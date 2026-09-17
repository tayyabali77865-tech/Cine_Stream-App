const axios = require('axios');

async function testServerJsHeaders() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://netmirror.center/',
    'Origin': 'https://netmirror.center',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  };
  try {
    const res = await axios.get('https://netmirror.center/api/related/Dial+1975?page=0', { headers, timeout: 5000 });
    console.log(res.data);
  } catch(e) {
    console.log('Failed:', e.response ? e.response.status : e.message);
  }
}
testServerJsHeaders();
