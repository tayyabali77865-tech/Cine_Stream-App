const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');

const secret = 'net###@@sss';
const timestamp = Math.floor(Date.now() / 1000);
const signature = crypto.createHmac('sha256', secret).update(String(timestamp)).digest('hex');

const id = '112516';
const se = '1';
const ep = '1';
const dp = 'R2xjd0g4YTAzbCtoZ3psdThHNVI2c2pZTVROZ3BFbXh5WUJIdzVZVjlTZngwOU1lYzM0WXJLUXpac2g5d1FNSQ==';
const title = 'Agent Kim Reactivated [Hindi]';
const na = Buffer.from(title).toString('base64');

// We also append &exten=1 as seen in code (exten=i, which is typically "1")
const watchboxUrl = `https://speed.watch22.shop/play/watchbox.php?id=${id}&se=${se}&ep=${ep}&dp=${dp}&na=${encodeURIComponent(na)}&ts=${timestamp}&sig=${signature}&exten=1`;
console.log('Constructed URL:', watchboxUrl);

axios.get(watchboxUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://fmoviesunblocked.net/'
  }
}).then(res => {
  const html = res.data;
  console.log('HTML Length:', html.length);
  
  const $ = cheerio.load(html);
  const sourceSrc = $('video source').attr('src');
  console.log('Video Source src:', sourceSrc);
  
  const downloadLink = $('.download-link').attr('href') || $('.button2').attr('href');
  console.log('Download link href:', downloadLink);
}).catch(err => {
  console.error('Error:', err.message);
});
