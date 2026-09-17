const axios = require('axios');
axios.get('https://netmirror.global/').then(res => {
  const html = res.data;
  const m = html.match(/\/assets\/index-[^"]+\.js/);
  const bundleUrl = m ? ('https://netmirror.global' + m[0]) : null;
  return axios.get(bundleUrl).then(res2 => {
    const code = res2.data;
    const idx = code.toLowerCase().indexOf('did you mean');
    // look 6000 chars before for useState/useEffect that sets y
    const chunk = code.substring(idx-6000, idx);
    console.log(chunk);
  });
}).catch(e => console.error(e.message));
