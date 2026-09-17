const axios = require('axios');
const fs = require('fs');
async function testScrape() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://netmirror.center/',
    'Accept': 'text/html'
  };
  try {
    const res = await axios.get('https://netmirror.center/tv/3891', { headers });
    fs.writeFileSync('test_html.html', res.data);
    console.log('Saved to test_html.html');
  } catch (e) {
    console.error(e.message);
  }
}
testScrape();
