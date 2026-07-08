const fs = require('fs');

const bundlePath = 'node_modules'; // Not in node_modules, it's downloaded in parse_js.js memory, but we didn't save the JS bundle to disk!
// Wait! Let's edit parse_js.js to save the JS bundle first, or write a script that downloads and searches directly.

const axios = require('axios');
const URL = 'https://netmirror.global/assets/index-794a1aad.js';

axios.get(URL).then(res => {
  const code = res.data;
  console.log('JS Bundle downloaded.');
  
  const searchStr = 'api2.imdb3.shop';
  let idx = 0;
  while ((idx = code.indexOf(searchStr, idx)) !== -1) {
    console.log(`\n--- Match at index ${idx} ---`);
    console.log(code.substring(idx - 150, idx + 250));
    idx += searchStr.length;
  }
  
  const searchStr2 = 'imdb4.shop';
  idx = 0;
  while ((idx = code.indexOf(searchStr2, idx)) !== -1) {
    console.log(`\n--- Match at index ${idx} ---`);
    console.log(code.substring(idx - 150, idx + 250));
    idx += searchStr2.length;
  }
}).catch(err => {
  console.error(err.message);
});
