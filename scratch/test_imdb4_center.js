const axios = require('axios');

async function test(mirror, referer) {
  try {
    const res = await axios.get(`${mirror}/movie/122804`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer
      },
      timeout: 4000
    });
    console.log(`✅ Success on ${mirror} with Referer ${referer}!`);
  } catch (err) {
    console.log(`❌ Failed on ${mirror} with Referer ${referer}: ${err.response ? err.response.status : err.message}`);
  }
}

async function run() {
  await test('https://api2.imdb3.shop/api', 'https://netmirror.global/');
  await test('https://api2.imdb3.shop/api', 'https://netmirror.center/');
  await test('https://api2.imdb4.shop/api', 'https://netmirror.global/');
  await test('https://api2.imdb4.shop/api', 'https://netmirror.center/');
}

run();
