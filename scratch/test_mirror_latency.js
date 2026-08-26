const axios = require('axios');

async function test(mirror) {
  const t1 = Date.now();
  try {
    const res = await axios.get(`${mirror}/movies/filter?sort_by=date&items_per_page=1&page=0`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://fmoviesunblocked.net/'
      },
      timeout: 4000
    });
    console.log(`✅ Filter success on ${mirror}: ${Date.now() - t1}ms`);
  } catch (err) {
    console.log(`❌ Filter failed on ${mirror}: ${err.response ? err.response.status : err.message}`);
  }

  const t2 = Date.now();
  try {
    const res = await axios.get(`${mirror}/search2/Moana?page=0`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://netmirror.center/',
        'Origin': 'https://netmirror.center'
      },
      timeout: 4000
    });
    console.log(`✅ Search success on ${mirror}: ${Date.now() - t2}ms`);
  } catch (err) {
    console.log(`❌ Search failed on ${mirror}: ${err.response ? err.response.status : err.message}`);
  }
}

async function run() {
  await test('https://api2.imdb3.shop/api');
  await test('https://api2.imdb4.shop/api');
}

run();
