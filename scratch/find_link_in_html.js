const axios = require('axios');
const crypto = require('crypto');

const secret = 'net###@@sss';

async function run() {
  const watchboxBaseUrl = 'https://speed.watch22.shop/play/watchdirect.php?id=QKZ/2Xq4PHpzhQOw7OokpVyOh7D6nKypV8i3j8W0oMOwoG9rZ7OcoW6sZbSfnlmsnqWc06Osn2KfnJ3Xn5pYnqVjZ2tsaqacpq1ra5yco2iwoG6sa7SfoG6r';
  
  const dummyRes = await axios.get(watchboxBaseUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://netmirror.global/'
    }
  });

  const timeMatch = dummyRes.data.match(/Time not Found\.<br><br>(\d+)/);
  const serverTime = timeMatch[1];
  const signature = crypto.createHmac('sha256', secret).update(String(serverTime)).digest('hex');
  const authUrl = `${watchboxBaseUrl}&ts=${serverTime}&sig=${signature}`;
  
  const authRes = await axios.get(authUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://netmirror.global/'
    }
  });

  const html = authRes.data;
  console.log("Contains 'hakunaymatata'?", html.includes('hakunaymatata'));
  console.log("Contains '14e9cbdbc13164a5edd510fc4f8ae63a'?", html.includes('14e9cbdbc13164a5edd510fc4f8ae63a'));
  
  // Print script tags or specific lines where it might be hidden
  const lines = html.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('hakunaymatata') || line.includes('play_url') || line.includes('cms')) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
}

run();
