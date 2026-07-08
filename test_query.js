const axios = require('axios');

const URL = 'https://api2.imdb3.shop/api/movies/filter?sort_by=date&dubbing=Hindi&country=india&items_per_page=7';

axios.get(URL, {
  headers: {
    'Content-Type': 'application/json'
  }
}).then(res => {
  console.log('Response keys:', Object.keys(res.data));
  if (res.data.results) {
    console.log('Number of results:', res.data.results.length);
    console.log('Sample item:', res.data.results[0]);
  } else {
    console.log('Full data:', res.data);
  }
}).catch(err => {
  console.error('Error querying API:', err.message);
});
