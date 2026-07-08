const axios = require('axios');
const URL = 'https://netmirror.global/assets/index-794a1aad.js';

axios.get(URL).then(res => {
  const code = res.data;
  console.log('JS Bundle downloaded.');
  
  // Search for SERVER_TIME
  let idx = 0;
  console.log('--- Matches for "SERVER_TIME" ---');
  while ((idx = code.indexOf('SERVER_TIME', idx)) !== -1) {
    console.log(code.substring(idx - 150, idx + 250));
    console.log('------------------------');
    idx += 'SERVER_TIME'.length;
  }

  // Search for sig calculation
  idx = 0;
  console.log('--- Matches for "sig" or "ts" surrounding watchbox ---');
  const searchStr = 'watchbox.php';
  while ((idx = code.indexOf(searchStr, idx)) !== -1) {
    console.log(code.substring(idx - 400, idx + 400));
    console.log('------------------------');
    idx += searchStr.length;
  }
}).catch(err => {
  console.error(err.message);
});
