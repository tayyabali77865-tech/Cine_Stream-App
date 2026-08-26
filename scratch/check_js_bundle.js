const axios = require('axios');

async function checkJS() {
  const url = 'https://netmirror.center/assets/index-2f647513.js';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    console.log('Fetching JS bundle...');
    const res = await axios.get(url, { headers, timeout: 10000 });
    const code = res.data;
    
    // Find all urls or domains in code
    const mirrorRegex = /(https?:\/\/api2\.[a-zA-Z0-9.-]+\.shop\/api)/g;
    let match;
    const discovered = new Set();
    while ((match = mirrorRegex.exec(code)) !== null) {
      discovered.add(match[1]);
    }
    console.log('Discovered API endpoints:', Array.from(discovered));

    // Look for search endpoints in JS code (like /search, /search2, etc.)
    console.log('Searching for endpoints...');
    const searchRegex = /(\/search[a-zA-Z0-9_/]*|\/movie[a-zA-Z0-9_/]*|\/movies[a-zA-Z0-9_/]*)/g;
    const matches = code.match(searchRegex) || [];
    const uniqueMatches = Array.from(new Set(matches)).filter(m => m.length < 50);
    console.log('Found route paths in JS:', uniqueMatches.slice(0, 30));

    // Check if there is any other api endpoints (like /api/ or something else)
    const anyApiRegex = /"https?:\/\/[^"]*"/g;
    const urls = code.match(anyApiRegex) || [];
    console.log('Found double-quoted URLs:', urls.filter(u => u.includes('api')));

  } catch (err) {
    console.error('Error fetching JS bundle:', err.message);
  }
}

checkJS();
