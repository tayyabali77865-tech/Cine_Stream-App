const axios = require('axios');

axios.get('https://api2.imdb3.shop/api/movie/121996').then(res => {
  console.log('Keys of response:', Object.keys(res.data));
  console.log('Results length:', res.data.results.length);
  console.log('First result item:', res.data.results[0]);
  if (res.data.results[0].season) {
    console.log('Seasons array sample:', res.data.results[0].season);
  }
}).catch(err => {
  console.error(err.message);
});
