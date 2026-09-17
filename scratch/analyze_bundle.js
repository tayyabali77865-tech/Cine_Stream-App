const axios = require('axios');
const crypto = require('crypto');

// Extract the r=ts, n=sig assignment logic from around the key variables
async function analyzeBundle() {
  const scriptUrl = 'https://netmirror.center/assets/index-f42cfd97.js';
  const scriptRes = await axios.get(scriptUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://netmirror.center/' }
  });
  const code = scriptRes.data;

  // Find where r (ts) and n (sig) are assigned — look for "net###@@sss" context
  const secretIdx = code.indexOf('net###@@sss');
  if (secretIdx !== -1) {
    const block = code.slice(Math.max(0, secretIdx - 1500), secretIdx + 500);
    console.log('=== Around net###@@sss ===\n', block);
  }
  
  // Also look for where ts & sig are computed (look for "serverTime" or similar patterns)
  const patterns = [
    /Math\.floor.{0,100}/g,
    /hmac.{0,300}/gi,
    /\.digest.{0,100}/g
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(code)) !== null) {
      console.log('PAT:', m[0].slice(0,200));
    }
  }
}
analyzeBundle().catch(console.error);
