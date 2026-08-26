const axios = require('axios');
const cheerio = require('cheerio');

async function discoverMirrors() {
  const list = [];
  try {
    const res = await axios.get('https://netmirror.global/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://fmoviesunblocked.net/'
      },
      timeout: 5000
    });
    const html = res.data;
    const $ = cheerio.load(html);
    let scriptSrc = '';
    $('script').each((i, el) => {
      const src = $(el).attr('src');
      if (src && src.includes('/assets/index-')) scriptSrc = src;
    });

    if (scriptSrc) {
      const scriptUrl = scriptSrc.startsWith('http') ? scriptSrc : `https://netmirror.global${scriptSrc}`;
      const scriptRes = await axios.get(scriptUrl, { timeout: 5000 });
      const code = scriptRes.data;
      const mirrorRegex = /(https?:\/\/api2\.[a-zA-Z0-9.-]+\.shop\/api)/g;
      let match;
      while ((match = mirrorRegex.exec(code)) !== null) {
        list.push(match[1]);
      }
    }
  } catch (err) {
    console.error('Mirror discovery failed:', err.message);
  }
  return [...new Set(list)];
}

async function run() {
  const mirrors = await discoverMirrors();
  console.log('Discovered mirrors:', mirrors);

  // We also add default ones
  const allMirrors = [...new Set([...mirrors, 'https://api2.imdb3.shop/api', 'https://api2.imdb4.shop/api', 'https://api2.imdb1.shop/api', 'https://api2.imdb2.shop/api'])];

  for (const mirror of allMirrors) {
    try {
      console.log(`Testing mirror: "${mirror}"...`);
      const res = await axios.get(`${mirror}/movie/122804`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://netmirror.global/'
        },
        timeout: 4000
      });
      console.log(`✅ SUCCESS (200) on mirror: "${mirror}"!`);
      console.log(`Data:`, JSON.stringify(res.data).substring(0, 300));
    } catch (err) {
      console.log(`❌ Failed on mirror: "${mirror}": ${err.response ? err.response.status : err.message}`);
    }
  }
}

run();
