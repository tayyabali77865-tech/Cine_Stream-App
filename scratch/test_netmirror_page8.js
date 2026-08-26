const axios = require('axios');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Referer': 'https://fmoviesunblocked.net/'
};

async function test() {
  // Query 1: country=Japan
  try {
    const res = await axios.get(`https://api2.imdb3.shop/api/movies/filter?sort_by=date&country=Japan&items_per_page=10&page=0`, { headers });
    const results = res.data.results || [];
    console.log(`country=Japan page 0 count: ${results.length}`);
    if (results.length > 0) {
      console.log(`First Japan title: ${results[0].title}`);
    }
  } catch (e) {
    console.log('country=Japan failed:', e.message);
  }

  // Query 2: genres[]=Anime / genres[]=Animation
  try {
    const res = await axios.get(`https://api2.imdb3.shop/api/movies/filter?sort_by=date&genres[]=Anime&items_per_page=10&page=0`, { headers });
    const results = res.data.results || [];
    console.log(`genres[]=Anime page 0 count: ${results.length}`);
    if (results.length > 0) {
      console.log(`First genres[]=Anime title: ${results[0].title}`);
    }
  } catch (e) {
    console.log('genres[]=Anime failed:', e.message);
  }

  // Query 3: genres[]=16 (16 is often Anime/Animation)
  try {
    const res = await axios.get(`https://api2.imdb3.shop/api/movies/filter?sort_by=date&genres[]=16&items_per_page=10&page=0`, { headers });
    const results = res.data.results || [];
    console.log(`genres[]=16 page 0 count: ${results.length}`);
    if (results.length > 0) {
      console.log(`First genres[]=16 title: ${results[0].title}`);
    }
  } catch (e) {
    console.log('genres[]=16 failed:', e.message);
  }
}

test();
