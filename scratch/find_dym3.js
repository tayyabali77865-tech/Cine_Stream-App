const axios = require('axios');
axios.get('https://netmirror.global/').then(res => {
  const html = res.data;
  const m = html.match(/\/assets\/index-[^"]+\.js/);
  const bundleUrl = m ? ('https://netmirror.global' + m[0]) : null;
  return axios.get(bundleUrl).then(res2 => {
    const code = res2.data;
    // found at 651876, get bigger context - look before to find state initialization
    const idx = code.toLowerCase().indexOf('did you mean');
    // look 3000 chars before to find the full component
    console.log(code.substring(idx-3000, idx));
  });
}).catch(e => console.error(e.message));
