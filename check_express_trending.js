const axios = require('axios');

axios.get('http://localhost:5173/api/trending').then(res => {
  console.log('Trending results count from Express:', res.data.length);
  if (res.data.length > 0) {
    console.log('First item title:', res.data[0].title);
  }
}).catch(err => {
  console.error(err.message);
});
