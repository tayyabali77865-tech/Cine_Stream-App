const axios = require('axios');
const crypto = require('crypto');

const HM_SECRET = 'net###@@sss';
const REFERER = 'https://netmirror.center/';

async function testExactFlow(movieId, dp, title) {
  const na = Buffer.from(title).toString('base64');
  
  // First get the SERVER_TIME from the page (the same way browser does)
  const pageRes = await axios.get(`https://netmirror.center/movie/${movieId}/`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Referer': 'https://netmirror.center/' }
  });
  const serverTimeMatch = pageRes.data.match(/window\.SERVER_TIME\s*=\s*(\d+)/);
  const pageServerTime = serverTimeMatch ? serverTimeMatch[1] : null;
  console.log('Page SERVER_TIME:', pageServerTime);
  
  const domains = ['bet.watch21.shop', 'play.watch21.shop', 'limit.watch22.shop'];
  
  for (const domain of domains) {
    console.log(`\n--- Testing domain: ${domain} ---`);
    const watchboxBaseUrl = `https://${domain}/play/watchbox.php?id=${movieId}&se=&ep=&dp=${encodeURIComponent(dp)}&na=${encodeURIComponent(na)}&exten=1`;
    
    try {
      // Get server time from watchbox.php itself (ts=0, sig=0)
      const dummyRes = await axios.get(`${watchboxBaseUrl}&ts=0&sig=0`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': REFERER },
        timeout: 8000
      });
      
      const timeMatch = dummyRes.data.match(/Time not Found\.<br><br>(\d+)/);
      if (!timeMatch) {
        console.log('Response:', dummyRes.data.slice(0, 80));
        continue;
      }
      
      const watchboxTime = timeMatch[1];
      console.log('Watchbox server time:', watchboxTime);
      
      // Test all timestamp + sig combinations
      const tests = [
        { ts: watchboxTime, msg: `${movieId}:${watchboxTime}`, label: 'watchboxTime | id:ts' },
        { ts: pageServerTime, msg: `${movieId}:${pageServerTime}`, label: 'pageServerTime | id:ts' },
        { ts: watchboxTime, msg: watchboxTime, label: 'watchboxTime | ts only' },
        { ts: pageServerTime, msg: pageServerTime, label: 'pageServerTime | ts only' },
      ];
      
      for (const t of tests) {
        if (!t.ts) continue;
        const sig = crypto.createHmac('sha256', HM_SECRET).update(t.msg).digest('hex');
        const authRes = await axios.get(`${watchboxBaseUrl}&ts=${t.ts}&sig=${sig}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': REFERER },
          timeout: 8000
        });
        const html = authRes.data;
        const success = html.includes('dl-item') || html.includes('r2.dev') || html.includes('.mp4') || html.includes('download-link');
        console.log(`  [${t.label}]: ${success ? '🎉 SUCCESS' : 'FAILED - ' + html.replace(/<[^>]*>/g, '').trim().slice(0, 50)}`);
        if (success) {
          console.log('  Full HTML length:', html.length);
          return;
        }
      }
    } catch(e) {
      console.log('Error on', domain, ':', e.message.slice(0, 100));
    }
  }
}

testExactFlow(
  '112234',
  'UVYxN2tlWDJFQVZBT09EbitiY1U3N0xnSFpMNWg3bXBHbVMrcEV1TjFiWEJKajB3ZHRIemdvM3UwS2M4UDRPYg==',
  'Cocktail 2 [Hindi]'
).catch(console.error);
