const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');

const secret = 'net###@@sss';

async function resolveStream() {
  const id = '112516';
  const se = '1';
  const ep = '1';
  const dp = 'R2xjd0g4YTAzbCtoZ3psdThHNVI2c2pZTVROZ3BFbXh5WUJIdzVZVjlTZngwOU1lYzM0WXJLUXpac2g5d1FNSQ==';
  const title = 'Agent Kim Reactivated [Hindi]';
  const na = Buffer.from(title).toString('base64');
  
  // 1. Initial dummy request to fetch the correct server time
  const dummyUrl = `https://speed.watch22.shop/play/watchbox.php?id=${id}&se=${se}&ep=${ep}&dp=${dp}&na=${encodeURIComponent(na)}&ts=0&sig=0&exten=1`;
  console.log('Sending dummy request...');
  
  try {
    const res = await axios.get(dummyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://fmoviesunblocked.net/'
      }
    });
    
    let serverTime = null;
    const timeMatch = res.data.match(/Time not Found\.<br><br>(\d+)/);
    if (timeMatch) {
      serverTime = timeMatch[1];
      console.log('Extracted Server Time:', serverTime);
    } else {
      console.log('No time found, full output:', res.data);
      return;
    }
    
    // 2. Generate correct HMAC signature
    const signature = crypto.createHmac('sha256', secret).update(String(serverTime)).digest('hex');
    
    // 3. Send final authorized request
    const authUrl = `https://speed.watch22.shop/play/watchbox.php?id=${id}&se=${se}&ep=${ep}&dp=${dp}&na=${encodeURIComponent(na)}&ts=${serverTime}&sig=${signature}&exten=1`;
    console.log('Sending authorized request to:', authUrl);
    
    const finalRes = await axios.get(authUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://fmoviesunblocked.net/'
      }
    });
    
    console.log('Final HTML Length:', finalRes.data.length);
    
    const $ = cheerio.load(finalRes.data);
    const videoUrl = $('video source').attr('src') || $('.download-link').attr('href') || $('.button2').attr('href');
    console.log('Resolved Stream Link:', videoUrl);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

resolveStream();
