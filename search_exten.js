const axios = require('axios');
const URL = 'https://netmirror.global/assets/index-794a1aad.js';

axios.get(URL).then(res => {
  const code = res.data;
  console.log('JS Bundle downloaded.');
  
  const searchStr = 'watchbox.php';
  let idx = code.indexOf(searchStr);
  if (idx !== -1) {
    // Print 3000 characters before watchbox.php to find what "i" (exten) is
    console.log(code.substring(idx - 3000, idx));
  }
}).catch(err => {
  console.error(err.message);
});
