const axios = require('axios');

const endpoints = [
  'https://api2.imdb3.shop/api/movie/122059',
  'https://api2.imdb3.shop/api/movies/122059',
  'https://api2.imdb3.shop/api/details/122059',
  'https://api2.imdb3.shop/api/alls/122059',
];

async function test() {
  for (const url of endpoints) {
    try {
      const res = await axios.get(url);
      console.log(`\nURL: ${url} -> SUCCESS`);
      console.log('Keys:', Object.keys(res.data));
      console.log('Sample Data:', JSON.stringify(res.data).substring(0, 300));
    } catch (err) {
      console.log(`URL: ${url} -> FAILED (${err.message})`);
    }
  }
}

test();
