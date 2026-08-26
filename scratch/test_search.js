const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  const homeUrl = 'https://netmirror.global/';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://fmoviesunblocked.net/'
  };

  try {
    console.log('Fetching homepage...');
    const res = await axios.get(homeUrl, { headers, timeout: 5000 });
    const $ = cheerio.load(res.data);
    let scriptSrc = '';
    $('script').each((i, el) => {
      const src = $(el).attr('src');
      if (src && src.includes('/assets/index-')) {
        scriptSrc = src;
      }
    });

    if (scriptSrc) {
      const scriptUrl = scriptSrc.startsWith('http') ? scriptSrc : `${homeUrl.replace(/\/$/, '')}${scriptSrc}`;
      console.log(`Found JS bundle: ${scriptUrl}`);
      const scriptRes = await axios.get(scriptUrl, { headers, timeout: 5000 });
      const code = scriptRes.data;
      
      const mirrorRegex = /(https?:\/\/api2\.[a-zA-Z0-9.-]+\.shop\/api)/g;
      let match;
      const discovered = [];
      while ((match = mirrorRegex.exec(code)) !== null) {
        discovered.push(match[1]);
      }
      console.log('Discovered mirrors in JS:', discovered);

      for (const api of discovered) {
        try {
          console.log(`Testing search on: ${api}`);
          // Try search2
          const searchRes2 = await axios.get(`${api}/search2/Moana?page=0`, { headers, timeout: 5000 });
          console.log(`  search2/Moana response:`, JSON.stringify(searchRes2.data).substring(0, 300));
        } catch (e) {
          console.log(`  Error on ${api}:`, e.message);
        }
      }
    } else {
      console.log('No index script found.');
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}

test();
