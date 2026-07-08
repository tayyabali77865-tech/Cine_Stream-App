const axios = require('axios');
const cheerio = require('cheerio');

const embedUrl = 'https://new6.filesdl.top/cloud/T4EkwPVdhx';

axios.get(embedUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
}).then(res => {
  const html = res.data;
  const $ = cheerio.load(html);
  
  // Find download-link href
  const href = $('.download-link').attr('href');
  console.log('Extracted Video/Download Link:', href);
}).catch(err => {
  console.error('Error fetching embed:', err.message);
});
