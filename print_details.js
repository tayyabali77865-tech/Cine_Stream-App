const axios = require('axios');

axios.get('https://api2.imdb3.shop/api/movie/122059').then(res => {
  console.log('Results item details:', res.data.results[0]);
}).catch(err => {
  console.error(err.message);
});
