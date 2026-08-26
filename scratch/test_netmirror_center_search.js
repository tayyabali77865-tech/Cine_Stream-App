const axios = require('axios');

async function test() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://netmirror.center/',
    'Origin': 'https://netmirror.center',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const urls = [
    'https://api2.imdb3.shop/api/search2/Moana?page=0',
    'https://api2.imdb4.shop/api/search2/Moana?page=0',
  ];

  for (const url of urls) {
    try {
      console.log(`Requesting: ${url}`);
      const res = await axios.get(url, { headers, timeout: 5000 });
      console.log(`Success! Status: ${res.status}`);
      console.log(`Data:`, JSON.stringify(res.data).substring(0, 300));
    } catch (err) {
      console.log(`Failed! Message: ${err.message}`);
      if (err.response) {
        console.log(`  Response Status: ${err.response.status}`);
        console.log(`  Response Data:`, JSON.stringify(err.response.data));
      }
    }
  }
}

test();
