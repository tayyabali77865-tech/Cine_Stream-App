const axios = require('axios');

axios.get('https://api2.imdb3.shop/api/movie/112516').then(res => {
  console.log('Results length:', res.data.results.length);
  console.log('Result item:', res.data.results[0]);
}).catch(err => {
  console.error(err.message);
});
