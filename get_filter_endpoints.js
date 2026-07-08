const axios = require('axios');
const URL = 'https://netmirror.global/assets/index-794a1aad.js';

axios.get(URL).then(res => {
  const code = res.data;
  console.log('JS Bundle downloaded.');
  
  // Find all matches for filter?
  const regex = /filter\?[^\`\'\"]+/g;
  const matches = code.match(regex);
  if (matches) {
    console.log('Matches for filter query params:');
    matches.forEach(m => console.log(m));
  } else {
    console.log('No matches for filter? query params.');
  }
}).catch(err => {
  console.error(err.message);
});
