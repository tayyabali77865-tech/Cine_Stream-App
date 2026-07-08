const axios = require('axios');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://netmirror.global/'
};

async function test() {
  const urls = [
    'https://api2.imdb3.shop/api/movies/filter?sort_by=date&genres=Anime&items_per_page=30&page=0',
    'https://api2.imdb3.shop/api/movies/filter?sort_by=date&genres=Animation&items_per_page=30&page=0',
    'https://api2.imdb3.shop/api/movies/filter?sort_by=date&genres[]=Anime&items_per_page=30&page=0',
    'https://api2.imdb3.shop/api/movies/filter?sort_by=date&genres[]=Animation&items_per_page=30&page=0'
  ];
  
  for (const url of urls) {
    try {
      const res = await axios.get(url, { headers });
      console.log(`URL: ${url}`);
      console.log(`Results: ${res.data.results ? res.data.results.length : 0}`);
      if (res.data.results && res.data.results.length > 0) {
        console.log(`First item: ${res.data.results[0].title}`);
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
}

test();
