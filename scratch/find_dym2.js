const axios = require('axios');
axios.get('https://netmirror.global/').then(res => {
  const html = res.data;
  const m = html.match(/\/assets\/index-[^"]+\.js/);
  const bundleUrl = m ? ('https://netmirror.global' + m[0]) : null;
  return axios.get(bundleUrl).then(res2 => {
    const code = res2.data;
    // found at 651876, get bigger context
    const idx = code.toLowerCase().indexOf('did you mean');
    console.log(code.substring(idx-1000, idx+2000));
  });
}).catch(e => console.error(e.message));
