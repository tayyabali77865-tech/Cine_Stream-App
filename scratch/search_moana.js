const axios = require('axios');

async function run() {
  try {
    // Let's search for Moana first to get the ID
    const searchRes = await axios.get('https://api2.imdb3.shop/api/search2/Moana?page=0');
    console.log('Search Results for Moana:');
    const items = searchRes.data.results || [];
    for (const item of items) {
      console.log(`ID: ${item.id}, Title: ${item.title}, Media Type: ${item.media_type}`);
      // Let's fetch details for this item
      const detailRes = await axios.get(`https://api2.imdb3.shop/api/movie/${item.id}`);
      const detailItem = detailRes.data.results[0];
      console.log('  Details - type:', detailItem.media_type, 'season:', detailItem.season);
    }
  } catch (err) {
    console.error(err.message);
  }
}
run();
