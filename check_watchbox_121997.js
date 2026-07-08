const axios = require('axios');
const crypto = require('crypto');

const secret = 'net###@@sss';

async function test() {
  const id = '121997';
  const se = '1';
  const ep = '1';
  const dp = 'QTVnUEljckxCTkIzTTArM0laNDFmWHJQKzc5TlBGcnY2b0F3eFZxTXJ3Zz0=';
  const title = 'Alpha';
  const na = Buffer.from(title).toString('base64');
  
  const watchboxBaseUrl = `https://speed.watch22.shop/play/watchbox.php?id=${id}&se=${se}&ep=${ep}&dp=${dp}&na=${encodeURIComponent(na)}&exten=1`;
  const netmirrorReferer = 'https://netmirror.hair/';
  
  // 1. Dummy request
  const dummyRes = await axios.get(`${watchboxBaseUrl}&ts=0&sig=0`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': netmirrorReferer
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
      'Referer': netmirrorReferer
    }
  });
  
  console.log('HTML Output for 121997 Watchbox:');
  console.log(finalRes.data);
}

test();
