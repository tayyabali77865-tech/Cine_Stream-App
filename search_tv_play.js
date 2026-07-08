const axios = require('axios');
const URL = 'https://netmirror.global/assets/index-794a1aad.js';

axios.get(URL).then(res => {
  const code = res.data;
  console.log('JS Bundle downloaded.');
  
  // Look for occurrences of "season" or "episode" or ".embed" or "dp"
  let idx = 0;
  const searchStr = 'season';
  console.log('--- Matches for "season" ---');
  while ((idx = code.indexOf(searchStr, idx)) !== -1) {
    if (code.substring(idx - 100, idx + 100).includes('api')) {
      console.log(code.substring(idx - 150, idx + 250));
      console.log('------------------------');
    }
    idx += searchStr.length;
  }
}).catch(err => {
  console.error(err.message);
});
