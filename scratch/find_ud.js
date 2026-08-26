const axios = require('axios');

async function findUd() {
  const url = 'https://netmirror.center/assets/index-2f647513.js';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    const res = await axios.get(url, { headers, timeout: 10000 });
    const code = res.data;
    
    // Find "uD="
    let pos = 0;
    while (true) {
      pos = code.indexOf('uD=', pos);
      if (pos === -1) break;
      console.log(`uD= found at ${pos}`);
      console.log(`Context: ...${code.substring(pos - 150, pos + 150)}...`);
      pos += 3;
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

findUd();
