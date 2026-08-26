const axios = require('axios');

const getHeaders = (referer = 'https://netmirror.center/') => ({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': referer,
  'Origin': 'https://netmirror.center'
});

async function run() {
  // Let's format the query exactly:
  // "Spider-Man Brand New Day" -> "Spider-Man: Brand New Day" -> cleaned as "Spider Man Brand New Day" -> "Spider+Man+Brand+New+Day"
  const formattedQuery = "Spider+Man+Brand+New+Day";
  const searchUrl = `https://api2.imdb4.shop/api/search2/${formattedQuery}?page=0`;
  try {
    console.log(`Searching with formatted query: ${formattedQuery}...`);
    const searchRes = await axios.get(searchUrl, { headers: getHeaders() });
    console.log('Search Results:', JSON.stringify(searchRes.data, null, 2));
  } catch (err) {
    console.error('Error:', err.response ? err.response.status + ' ' + JSON.stringify(err.response.data) : err.message);
  }
}

run();
