const axios = require('axios');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://netmirror.global/'
};

async function test() {
  // Check how many pages each TV query has
  const filters = [
    { name: 'All TV', base: 'type=2&sort_by=date' },
    { name: 'Hindi TV', base: 'type=2&dubbing=Hindi' },
    { name: 'Korean TV', base: 'type=2&country=Korea' },
    { name: 'Chinese TV', base: 'type=2&country=China' },
  ];

  for (const f of filters) {
    console.log(`\n--- ${f.name} ---`);
    for (const page of [0, 5, 10, 20, 30, 35, 38]) {
      const url = `https://api2.imdb3.shop/api/movies/filter?${f.base}&items_per_page=30&page=${page}`;
      try {
        const res = await axios.get(url, { headers });
        const count = (res.data.results || []).length;
        console.log(`  Page ${page}: ${count} items`);
      } catch (e) {
        console.log(`  Page ${page}: 404/FAILED`);
        break;
      }
    }
  }
}

test();
