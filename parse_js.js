const axios = require('axios');
const fs = require('fs');

const URL = 'https://netmirror.global/assets/index-794a1aad.js';
const REFERER_URL = 'https://fmoviesunblocked.net/';

axios.get(URL, {
  headers: {
    'Referer': REFERER_URL,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  }
}).then(res => {
  const code = res.data;
  console.log('JS Bundle downloaded. Length:', code.length);
  
  // Find URL patterns, api strings, or endpoint paths
  const urls = [];
  
  // Look for any string matching /api/ or similar
  const apiRegex = /["'](\/[a-zA-Z0-9_\-\/]+api\/[a-zA-Z0-9_\-\/]+)["']/g;
  let match;
  while ((match = apiRegex.exec(code)) !== null) {
    urls.push(match[1]);
  }
  
  // Look for URL paths like /db/ or json endpoints
  const pathRegex = /["'](\/[a-zA-Z0-9_\-\/]+\.json)["']/g;
  while ((match = pathRegex.exec(code)) !== null) {
    urls.push(match[1]);
  }

  // Also check for any absolute URL containing netmirror or api
  const urlRegex = /(https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[a-zA-Z0-9_\-\/.:?%=&]*)/g;
  while ((match = urlRegex.exec(code)) !== null) {
    if (match[1].includes('netmirror') || match[1].includes('api') || match[1].includes('db') || match[1].includes('json')) {
      urls.push(match[1]);
    }
  }
  
  console.log('Found API/URL Candidates:', [...new Set(urls)]);
  fs.writeFileSync('parsed_urls.txt', JSON.stringify([...new Set(urls)], null, 2));
}).catch(err => {
  console.error('Error:', err.message);
});
