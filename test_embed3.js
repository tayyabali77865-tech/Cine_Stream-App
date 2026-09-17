const axios = require('axios');
axios.get('https://netmirror.center/movie/112234/?embed=1').then(res => {
  const html = res.data;
  console.log(html.substring(0, 1500));
  const matches = html.match(/watchbox\.php[^"']+/g);
  console.log("Watchbox URLs found:", matches);
}).catch(console.error);
