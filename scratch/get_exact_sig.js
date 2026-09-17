const axios = require('axios');
const crypto = require('crypto');

async function getExactSigCode() {
  const scriptUrl = 'https://netmirror.center/assets/index-f42cfd97.js';
  const scriptRes = await axios.get(scriptUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://netmirror.center/' }});
  const code = scriptRes.data;
  
  // Extract around the $6 async function which creates signatures
  const sig6Idx = code.indexOf('async function $6');
  if (sig6Idx !== -1) {
    console.log('=== $6 function context ===');
    console.log(code.slice(sig6Idx, sig6Idx + 300));
  }

  // Look for where $6 is CALLED and what happens with its result
  const call6Idx = code.indexOf('await $6(');
  if (call6Idx !== -1) {
    console.log('\n=== $6 call context ===');
    console.log(code.slice(Math.max(0, call6Idx - 500), call6Idx + 500));
  }
  
  // Also find how the data-fp attribute on html tag works (seen in the page HTML)
  const fpIdx = code.indexOf('data-fp');
  if (fpIdx !== -1) {
    console.log('\n=== data-fp context ===');
    console.log(code.slice(Math.max(0, fpIdx - 200), fpIdx + 300));
  }
  
  // Look for where SERVER_TIME is set/used
  const serverTimeIdx = code.indexOf('SERVER_TIME');
  if (serverTimeIdx !== -1) {
    console.log('\n=== SERVER_TIME context ===');
    console.log(code.slice(Math.max(0, serverTimeIdx - 300), serverTimeIdx + 300));
  }
}
getExactSigCode().catch(console.error);
