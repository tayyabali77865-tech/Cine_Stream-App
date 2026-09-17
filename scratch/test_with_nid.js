const axios = require('axios');
const crypto = require('crypto');

const HM_SECRET = 'net###@@sss';

// From JS bundle analysis, the watchbox URL format is:
// watchbox.php?id=Ce&se=He&ep=bt&dp=Cr&na=...&ts=r&sig=n&nid=Qt&exten=i&tv=ct&token=or
// where:
//   r = timestamp (from $6(t) function where t is the movie id)
//   n = HmacSHA256(`${id}:${ts}`, "net###@@sss")
//   Qt = nid (seems to be from somewhere - maybe 0 or empty)
//   i = exten value (1)
//   ct = a.tv field (TV show related?)
//   or = a.token field

// Note: The signature function $6(e) takes movie ID as parameter 'e'
// The TIMESTAMP used is window.SERVER_TIME (from the page HTML) NOT from watchbox.php ts=0 challenge

async function testWithServerTime(movieId, dp, title, se, ep) {
  const REFERER = 'https://netmirror.center/';
  
  // Get SERVER_TIME from the page (as browser does)
  const pageRes = await axios.get(`https://netmirror.center/movie/${movieId}/`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://netmirror.center/'
    }
  });
  
  const serverTimeMatch = pageRes.data.match(/window\.SERVER_TIME\s*=\s*(\d+)/);
  if (!serverTimeMatch) return console.log('No SERVER_TIME in page HTML');
  
  const timestamp = serverTimeMatch[1];
  console.log('Page SERVER_TIME:', timestamp);
  
  const na = Buffer.from(title.trim()).toString('base64');
  const signature = crypto.createHmac('sha256', HM_SECRET).update(`${movieId}:${timestamp}`).digest('hex');
  
  console.log('Signature:', signature);
  
  const domains = ['bet.watch21.shop', 'play.watch21.shop', 'limit.watch22.shop', 'bet.watch22.shop'];
  
  for (const domain of domains) {
    // Try with nid=0, token='', tv=''
    const url1 = `https://${domain}/play/watchbox.php?id=${movieId}&se=${se}&ep=${ep}&dp=${encodeURIComponent(dp)}&na=${encodeURIComponent(na)}&ts=${timestamp}&sig=${signature}&nid=0&exten=1&tv=&token=`;
    
    try {
      const res = await axios.get(url1, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': REFERER,
        },
        timeout: 8000
      });
      
      const html = res.data;
      const success = html.includes('dl-item') || html.includes('r2.dev') || html.includes('.mp4') || html.includes('download-link');
      console.log(`${domain}: ${success ? '🎉 SUCCESS' : 'FAILED - ' + html.replace(/<[^>]*>/g, '').trim().slice(0, 40)}`);
      if (success) return;
    } catch(e) {
      console.log(`${domain} Error:`, e.message.slice(0,80));
    }
  }
}

testWithServerTime(
  '112516',
  'R2xjd0g4YTAzbCtoZ3psdThHNVI2c2pZTVROZ3BFbXh5WUJIdzVZVjlTZngwOU1lYzM0WXJLUXpac2g5d1FNSQ==',
  'Agent Kim Reactivated [Hindi]',
  '1', '1'
).catch(console.error);
