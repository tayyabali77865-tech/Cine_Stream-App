const axios = require('axios');
const crypto = require('crypto');

async function findNewSecret() {
  // Try multiple base URLs
  const tryUrls = ['https://netmirror.center/', 'https://netmirror.global/'];
  let homeHtml = '';
  let baseOrigin = '';
  for (const u of tryUrls) {
    try {
      const r = await axios.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Referer': 'https://fmoviesunblocked.net/' }, timeout: 8000 });
      homeHtml = r.data;
      baseOrigin = u;
      console.log('Got HTML from:', u, '(', homeHtml.length, 'bytes )');
      break;
    } catch(e) {
      console.log('Failed', u, e.message);
    }
  }
  if (!homeHtml) return console.log('Could not fetch any homepage');

  const scriptMatch = homeHtml.match(/src="(\/assets\/index-[^"]+\.js)"/) || homeHtml.match(/src="(https?:\/\/[^"]+\/assets\/index-[^"]+\.js)"/); 
  if (!scriptMatch) {
    console.log('No index script found in HTML, looking for any JS bundle...');
    const jsMatches = homeHtml.match(/src="([^"]+\.js)"/g);
    console.log('All JS files:', jsMatches);
    return;
  }
  
  const scriptSrc = scriptMatch[1];
  const scriptUrl = scriptSrc.startsWith('http') ? scriptSrc : baseOrigin.replace(/\/$/, '') + scriptSrc;
  console.log('Script URL:', scriptUrl);
  
  // 2. Download the JS bundle
  const scriptRes = await axios.get(scriptUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': baseOrigin }
  });
  const code = scriptRes.data;
  console.log('Script size:', code.length, 'bytes');

  // 3. Search for watchbox.php URL pattern to see how sig is generated
  const watchboxMatches = [];
  const watchboxRe = /watchbox\.php[^`'"]{0,500}/g;
  let m;
  while ((m = watchboxRe.exec(code)) !== null) {
    watchboxMatches.push(m[0].slice(0, 300));
  }
  console.log('\n=== watchbox.php occurrences ===');
  watchboxMatches.forEach((x, i) => console.log(`[${i}]`, x));

  // 4. Search for HMAC calls
  const hmacRe = /createHmac\(.{0,200}\)/g;
  console.log('\n=== createHmac calls ===');
  while ((m = hmacRe.exec(code)) !== null) {
    console.log(m[0].slice(0, 200));
  }

  // 5. Search for sig= assignments
  const sigRe = /sig\s*=\s*.{0,200}/g;
  console.log('\n=== sig= assignments ===');
  let count = 0;
  while ((m = sigRe.exec(code)) !== null && count < 10) {
    console.log(m[0].slice(0, 200));
    count++;
  }

  // 6. Look for any secrets / keys  
  const keyRe = /["']([A-Za-z0-9$#@!*]{8,30})["']/g;
  const keyMatches = new Set();
  while ((m = keyRe.exec(code)) !== null) {
    const val = m[1];
    if (val.includes('#') || val.includes('@') || val.includes('$') || val.toLowerCase().includes('secret') || val.toLowerCase().includes('mirror')) {
      keyMatches.add(val);
    }
  }
  console.log('\n=== Potential secret strings ===');
  keyMatches.forEach(x => console.log(x));
}

findNewSecret().catch(console.error);
