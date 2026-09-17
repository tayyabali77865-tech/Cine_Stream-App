const axios = require('axios');
const crypto = require('crypto');

// Full working test: simulate exactly what the browser does
// 1. Fetch movie page to get SERVER_TIME from the HTML
// 2. Use SERVER_TIME + movie_id to generate signature
// 3. Send to watchbox.php with correct ts+sig

async function testBrowserFlow(movieId, dp, title) {
  const REFERER = 'https://netmirror.center/';
  const HM_SECRET = 'net###@@sss';
  
  console.log('Step 1: Fetching movie page to get SERVER_TIME...');
  
  // Get the movie page HTML to see if SERVER_TIME is injected
  const pageRes = await axios.get(`https://netmirror.center/movie/${movieId}/`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://netmirror.center/' }
  });
  
  const pageHtml = pageRes.data;
  const serverTimeMatch = pageHtml.match(/SERVER_TIME['":\s=]+(\d+)/);
  const fpMatch = pageHtml.match(/data-fp="([^"]+)"/);
  
  console.log('SERVER_TIME in page:', serverTimeMatch ? serverTimeMatch[1] : 'NOT FOUND');
  console.log('data-fp in page:', fpMatch ? fpMatch[1] : 'NOT FOUND');
  console.log('Page length:', pageHtml.length);
  
  // If no SERVER_TIME in page, the browser falls back to Math.floor(Date.now()/1000)
  const timestamp = serverTimeMatch ? parseInt(serverTimeMatch[1]) : Math.floor(Date.now() / 1000);
  console.log('Using timestamp:', timestamp);
  
  // Generate signature: HmacSHA256(`${movieId}:${timestamp}`, "net###@@sss")
  const crypto_node = require('crypto');
  // Note: JS bundle uses CryptoJS which might produce different output than Node's crypto
  // Let's try both
  const sig_node = crypto_node.createHmac('sha256', HM_SECRET).update(`${movieId}:${timestamp}`).digest('hex');
  console.log('Signature (node):', sig_node);
  
  const na = Buffer.from(title).toString('base64');
  const domain = 'bet.watch21.shop';
  const watchboxUrl = `https://${domain}/play/watchbox.php?id=${movieId}&se=&ep=&dp=${encodeURIComponent(dp)}&na=${encodeURIComponent(na)}&exten=1&ts=${timestamp}&sig=${sig_node}`;
  
  console.log('\nStep 2: Sending to watchbox...');
  const result = await axios.get(watchboxUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': REFERER }
  });
  
  const html = result.data;
  if (html.includes('dl-item') || html.includes('r2.dev') || html.includes('download-link')) {
    console.log('🎉 SUCCESS! HTML length:', html.length);
  } else {
    console.log('FAILED. Response:', html.slice(0, 120));
  }
}

testBrowserFlow(
  '112234',
  'UVYxN2tlWDJFQVZBT09EbitiY1U3N0xnSFpMNWg3bXBHbVMrcEV1TjFiWEJKajB3ZHRIemdvM3UwS2M4UDRPYg==',
  'Cocktail 2 [Hindi]'
).catch(console.error);
