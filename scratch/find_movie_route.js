const axios = require('axios');

async function findMovieRoute() {
  const url = 'https://netmirror.center/assets/index-2f647513.js';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    const res = await axios.get(url, { headers, timeout: 10000 });
    const code = res.data;
    
    // Find '/movie' context
    let index = 0;
    while (true) {
      const idx = code.indexOf('/movie', index);
      if (idx === -1) break;
      console.log(`- /movie found at Index ${idx}:`);
      console.log(`  Context: ...${code.substring(idx - 100, idx + 100)}...`);
      index = idx + 6;
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

findMovieRoute();
