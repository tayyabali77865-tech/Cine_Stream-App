const axios = require('axios');

axios.get('https://api2.imdb3.shop/api/movie/103375').then(res => {
  console.log('Results length:', res.data.results.length);
  console.log('Season details:', res.data.results[0].season);
}).catch(err => {
  console.error(err.message);
});
