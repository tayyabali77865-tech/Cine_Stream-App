const axios = require('axios');
const cheerio = require('cheerio');

async function inspect() {
  const homeUrl = 'https://netmirror.center/';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    console.log('Fetching homepage:', homeUrl);
    const res = await axios.get(homeUrl, { headers, timeout: 10000 });
    console.log('Status code:', res.status);
    const $ = cheerio.load(res.data);
    
    // Find all script tags
    console.log('Found scripts:');
    $('script').each((i, el) => {
      const src = $(el).attr('src');
      console.log(`  - Script ${i}:`, src || '[Inline script]');
      if (src && src.includes('index-')) {
        console.log(`    Possible bundle url: ${src}`);
      }
    });

    // Check if there is some script containing config
    $('script').each((i, el) => {
      const text = $(el).html();
      if (text && text.includes('api2')) {
        console.log(`  - Script ${i} contains "api2"`);
      }
    });

  } catch (err) {
    console.error('Error fetching new domain:', err.message);
    if (err.response) {
      console.log('Status:', err.response.status);
      console.log('Data:', err.response.data);
    }
  }
}

inspect();
