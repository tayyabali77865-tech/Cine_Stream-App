const axios = require('axios');
// Get current bundle name
axios.get('https://netmirror.global/').then(res => {
  const html = res.data;
  const m = html.match(/\/assets\/index-[^"]+\.js/);
  const bundleUrl = m ? ('https://netmirror.global' + m[0]) : null;
  console.log('Bundle URL:', bundleUrl);
  if (!bundleUrl) return;
  return axios.get(bundleUrl).then(res2 => {
    const code = res2.data;
    // search for "did" in various forms
    const query = 'Did You Mean';
    let idx = code.indexOf(query);
    if (idx > -1) {
      console.log('FOUND:', code.substring(idx-200, idx+500));
    } else {
      console.log('"Did You Mean" not in current bundle');
    }
    // search for 'did you' lowercase
    idx = code.toLowerCase().indexOf('did you mean');
    if (idx > -1) {
      console.log('lowercase FOUND at:', idx, code.substring(idx-100, idx+300));
    } else {
      console.log('lowercase not found either');
    }
  });
}).catch(e => console.error(e.message));
