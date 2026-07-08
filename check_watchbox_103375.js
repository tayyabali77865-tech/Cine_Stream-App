const axios = require('axios');
const crypto = require('crypto');

const secret = 'net###@@sss';

async function test() {
  const id = '103375';
  const se = '10';
  const ep = '9';
  const dp = 'OURXd1pWZ3ZKNTJxSmxUc3NpRTZvd0RObHpIYWlEakZPbVNSQmExSFlNQnd6QmxTcTl4MEorWURxaDhMVkN4ZQ==';
  const title = 'Naruto: Shippuden [Bengali]';
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
  
  console.log('HTML Output length:', finalRes.data.length);
  console.log('HTML sample:', finalRes.data.substring(0, 1500));
}

test();
