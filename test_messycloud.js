const axios = require('axios');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Referer': 'https://netmirror.global/'
};

axios.get('https://www.messycloud.ink/LuxfDBgOpges', { headers }).then(res => {
  console.log('HTML Length:', res.data.length);
  // Look for any links, source tags, or script matches
  console.log('Video sources:', res.data.match(/<source[^>]+src="([^"]+)"/g));
  console.log('Scripts:', res.data.match(/<script[^>]*>([\s\S]*?)<\/script>/g)?.slice(0, 5));
  // Look for R2.dev links
  console.log('R2 matches:', res.data.match(/(https?:\/\/[a-zA-Z0-9.-]+\.r2\.dev\/[^\'\"]+)/g));
  // Look for mp4/m3u8 links
  console.log('mp4/m3u8 matches:', res.data.match(/(https?:\/\/[^\'\"]+\.(mp4|m3u8|mkv)[^\'\"]*)/g));
}).catch(err => {
  console.error(err.message);
});
