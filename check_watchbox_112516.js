const axios = require('axios');
const crypto = require('crypto');

const secret = 'net###@@sss';

async function test() {
  const id = '112516';
  const se = '1';
  const ep = '1';
  const dp = 'R2xjd0g4YTAzbCtoZ3psdThHNVI2c2pZTVROZ3BFbXh5WUJIdzVZVjlTZngwOU1lYzM0WXJLUXpac2g5d1FNSQ==';
  const title = 'Agent Kim Reactivated [Hindi]';
  const na = Buffer.from(title).toString('base64');
  
  const watchboxBaseUrl = `https://speed.watch22.shop/play/watchbox.php?id=${id}&se=${se}&ep=${ep}&dp=${dp}&na=${encodeURIComponent(na)}&exten=1`;
  const referer = 'https://netmirror.global/';
  
  // 1. Dummy request
  const dummyRes = await axios.get(`${watchboxBaseUrl}&ts=0&sig=0`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': referer
    }
  });
  
  const timeMatch = dummyRes.data.match(/Time not Found\.<br><br>(\d+)/);
  if (!timeMatch) {
    console.log('No time found, response:', dummyRes.data);
    return;
  }
  
  const serverTime = timeMatch[1];
  const signature = crypto.createHmac('sha256', secret).update(String(serverTime)).digest('hex');
  const authUrl = `${watchboxBaseUrl}&ts=${serverTime}&sig=${signature}`;
  
  const finalRes = await axios.get(authUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': referer
    }
  });
  
  console.log('HTML Output for 112516 Watchbox:');
  console.log(finalRes.data.substring(0, 1000));
  if (finalRes.data.includes('pub-356c896ad5f742d18f2e8f4e5b5de59a.r2.dev') || finalRes.data.includes('download-link')) {
    console.log('SUCCESS: Stream link is present in the response!');
  }
}

test();
