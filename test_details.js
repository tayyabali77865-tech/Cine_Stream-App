const axios = require('axios');
axios.get('https://api2.imdb4.shop/api/movie/123115').then(res => {
  console.log(JSON.stringify(res.data).substring(0, 1000));
}).catch(console.error);
