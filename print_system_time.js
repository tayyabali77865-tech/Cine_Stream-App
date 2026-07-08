const axios = require('axios');

axios.get('https://api2.imdb3.shop/api/movies/filter?items_per_page=1').then(res => {
  console.log('System key content:', res.data.system);
}).catch(err => {
  console.error(err.message);
});
