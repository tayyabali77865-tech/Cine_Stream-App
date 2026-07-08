const axios = require('axios');
const cheerio = require('cheerio');

const id = '112516';
const se = '1';
const ep = '1';
const dp = 'R2xjd0g4YTAzbCtoZ3psdThHNVI2c2pZTVROZ3BFbXh5WUJIdzVZVjlTZngwOU1lYzM0WXJLUXpac2g5d1FNSQ==';
const title = 'Agent Kim Reactivated [Hindi]';
const na = Buffer.from(title).toString('base64');

const watchboxUrl = `https://speed.watch22.shop/play/watchbox.php?id=${id}&se=${se}&ep=${ep}&dp=${dp}&na=${encodeURIComponent(na)}`;
console.log('Constructed Watchbox URL:', watchboxUrl);

axios.get(watchboxUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://fmoviesunblocked.net/'
  }
}).then(res => {
  const html = res.data;
  console.log('HTML Length:', html.length);
  
  // Search for the stream url inside the HTML
  const $ = cheerio.load(html);
  
  // If it's a drivehub-like player
  const sourceSrc = $('video source').attr('src');
  console.log('Video Source src:', sourceSrc);
  
  // If it's a filesdl-like button
  const downloadLink = $('.download-link').attr('href') || $('.button2').attr('href');
  console.log('Download link href:', downloadLink);
}).catch(err => {
  console.error('Error fetching watchbox:', err.message);
});
