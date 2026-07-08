const axios = require('axios');

axios.get('http://localhost:8000/api/trending?category=Anime')
  .then(res => {
    console.log('Results Count:', res.data.length);
    if (res.data.length > 0) {
      console.log('First 5 Items:', res.data.slice(0, 5).map(item => ({
        title: item.title,
        type: item.type,
        channel: item.channel,
        country: item.country
      })));
    } else {
      console.log('Response empty:', res.data);
    }
  })
  .catch(err => {
    console.error('Error fetching anime endpoint:', err.message);
  });
