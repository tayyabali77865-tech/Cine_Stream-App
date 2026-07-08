const axios = require('axios');

const embedUrl = 'https://new6.filesdl.top/cloud/T4EkwPVdhx';

axios.get(embedUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
}).then(res => {
  const html = res.data;
  console.log('HTML Length:', html.length);
  
  // Search for mp4 or m3u8 URLs in the HTML
  const mp4Regex = /(https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[a-zA-Z0-9_\-\/.:?%=&]*\.mp4[a-zA-Z0-9_\-\/.:?%=&]*)/g;
  const matches = html.match(mp4Regex);
  console.log('Found MP4 links:', matches ? [...new Set(matches)] : 'None');
  
  const m3u8Regex = /(https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[a-zA-Z0-9_\-\/.:?%=&]*\.m3u8[a-zA-Z0-9_\-\/.:?%=&]*)/g;
  const m3u8Matches = html.match(m3u8Regex);
  console.log('Found M3U8 links:', m3u8Matches ? [...new Set(m3u8Matches)] : 'None');

  // Print any script blocks containing video sources
  const scripts = html.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/g);
  if (scripts) {
    console.log('Checking scripts for source variables...');
    for (const script of scripts) {
      if (script.includes('file') || script.includes('source') || script.includes('play')) {
        console.log('Matching script snippet:', script.substring(0, 400));
      }
    }
  }
}).catch(err => {
  console.error('Error fetching embed:', err.message);
});
