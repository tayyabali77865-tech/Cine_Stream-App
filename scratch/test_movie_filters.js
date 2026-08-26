const axios = require('axios');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://netmirror.global/'
};

async function test() {
  try {
    const resMovies = await axios.get('https://api2.imdb3.shop/api/movies/filter?type=1&items_per_page=30&page=0', { headers });
    const resTV = await axios.get('https://api2.imdb3.shop/api/movies/filter?type=2&items_per_page=30&page=0', { headers });
    const resAnime = await axios.get('https://api2.imdb3.shop/api/movies/list/filter?genre_ids[]=10&genre_ids[]=6&items_per_page=30&page=0', { headers });
    console.log("Movies:", resMovies.data.pager);
    console.log("TV Shows:", resTV.data.pager);
    console.log("Anime/Animation:", resAnime.data.pager);
  } catch (e) {
    console.error(e.message);
  }
}

test();
