const axios = require('axios');
const URL = 'https://netmirror.global/assets/index-794a1aad.js';

axios.get(URL).then(res => {
  const code = res.data;
  console.log('JS Bundle downloaded.');
  
  // Find matches of .dp
  let idx = 0;
  const searchStr = '.dp';
  console.log('--- Matches for ".dp" ---');
  while ((idx = code.indexOf(searchStr, idx)) !== -1) {
    console.log(code.substring(idx - 150, idx + 250));
    console.log('------------------------');
    idx += searchStr.length;
  }
  
  // Find matches of /api/play
  idx = 0;
  const searchStr2 = '/play';
  console.log('--- Matches for "/play" ---');
  while ((idx = code.indexOf(searchStr2, idx)) !== -1) {
    console.log(code.substring(idx - 150, idx + 250));
    console.log('------------------------');
    idx += searchStr2.length;
  }
}).catch(err => {
  console.error(err.message);
});
