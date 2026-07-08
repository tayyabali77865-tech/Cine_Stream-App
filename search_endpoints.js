const axios = require('axios');
const URL = 'https://netmirror.global/assets/index-794a1aad.js';

axios.get(URL).then(res => {
  const code = res.data;
  console.log('JS Bundle downloaded.');
  
  // Find all endpoints passed to `ko(` or fetch calls
  const endpoints = [];
  const regex = /ko\(\s*["'](\/[a-zA-Z0-9_\-\/?=&]+)["']/g;
  let match;
  while ((match = regex.exec(code)) !== null) {
    endpoints.push(match[1]);
  }
  
  const fetchRegex = /fetch\(\s*["'](\/[a-zA-Z0-9_\-\/?=&]+)["']/g;
  while ((match = fetchRegex.exec(code)) !== null) {
    endpoints.push(match[1]);
  }

  // Look for any string literal starting with "/" passed into api functions
  // like: "/trending", "/movies", "/tv", "/anime", etc.
  const pathRegex = /["'](\/(trending|movie|tv|anime|search|related|all|list|popular|top)[a-zA-Z0-9_\-\/?=&]*)["']/g;
  while ((match = pathRegex.exec(code)) !== null) {
    endpoints.push(match[1]);
  }

  console.log('Detected Endpoints:', [...new Set(endpoints)]);
}).catch(err => {
  console.error(err.message);
});
