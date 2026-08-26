const axios = require('axios');

const REFERER_URL = 'https://fmoviesunblocked.net/';
const getHeaders = (referer = REFERER_URL, clientIp = null) => {
  const hdrs = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': referer,
  };
  if (clientIp) {
    hdrs['X-Forwarded-For'] = clientIp;
  }
  return hdrs;
};

async function run() {
  const domains = [
    'https://api2.imdb3.shop/api',
    'https://api2.imdb4.shop/api',
    'https://api2.imdb1.shop/api',
    'https://api2.imdb2.shop/api'
  ];

  for (const domain of domains) {
    const url = `${domain}/search2/spider?page=0`;
    try {
      console.log(`Checking ${domain}...`);
      const res = await axios.get(url, { headers: getHeaders(), timeout: 5000 });
      if (typeof res.data === 'object') {
        console.log(`✅ SUCCESS on ${domain}: returned JSON.`);
      } else {
        console.log(`❌ HTML page on ${domain}`);
      }
    } catch (err) {
      console.log(`❌ Failed on ${domain}: ${err.message}`);
    }
  }
}

run();
