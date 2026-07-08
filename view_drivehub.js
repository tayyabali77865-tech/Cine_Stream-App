const axios = require('axios');

axios.get('https://new16.drivehub.cfd/play.php?id=8490948', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
}).then(res => {
  console.log(res.data);
}).catch(err => {
  console.error(err.message);
});
