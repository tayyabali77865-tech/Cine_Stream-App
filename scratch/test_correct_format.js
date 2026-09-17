const axios = require('axios');
const crypto = require('crypto');

const HM_SECRET = 'net###@@sss';

// CRITICAL FINDING from JS bundle:
// ye(e.subjectid, ie, q, e.embed, e.title, e.dp, x, e.embed_en, e.embed_json, e.id)
// Function: ye(Ce, He, bt, Ht, Br, Cr, Kt="", lt="", At=[], Qt)
// In watchbox URL:
//   id = Ce = e.SUBJECTID (NOT movie id!)
//   se = He, ep = bt
//   dp = Cr = e.dp
//   na = window.btoa(Ee(Br)) = window.btoa(Ee(e.title)) = base64 of utf8 encoded title
//   nid = Qt = e.ID (the regular movie id)
//   ts = r = timestamp from $6(t)
//   sig = n = hmac signature from $6(t)
// And $6(t) where t is the MOVIE ID (from URL params t = movie id)
// So: sig = HmacSHA256("movie_id:timestamp", "net###@@sss")

// For Agent Kim: 
//   id (subjectid) = 847017270923651456  
//   nid = 112516 (regular id)
//   sig = HmacSHA256("112516:timestamp", "net###@@sss")

async function testCorrectFormat(subjectid, movieId, dp, title, se, ep) {
  const REFERER = 'https://netmirror.center/';
  
  // Get SERVER_TIME from page
  const pageRes = await axios.get(`https://netmirror.center/movie/${movieId}/`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': REFERER
    }
  });
  
  const serverTimeMatch = pageRes.data.match(/window\.SERVER_TIME\s*=\s*(\d+)/);
  if (!serverTimeMatch) return console.log('No SERVER_TIME');
  const timestamp = serverTimeMatch[1];
  console.log('SERVER_TIME:', timestamp);
  
  // na = base64 of UTF-8 encoded title (Ee function encodes to utf8 first)
  // Ee(Ce) = String.fromCharCode(...new TextEncoder().encode(Ce))
  const na = Buffer.from(title.trim()).toString('base64');
  
  // sig = HmacSHA256(movieId:timestamp, secret)
  const signature = crypto.createHmac('sha256', HM_SECRET).update(`${movieId}:${timestamp}`).digest('hex');
  
  console.log('Using: subjectid=' + subjectid + ', nid=' + movieId);
  console.log('Signature:', signature);
  
  const domains = ['bet.watch21.shop', 'play.watch21.shop', 'limit.watch22.shop'];
  
  for (const domain of domains) {
    const watchboxUrl = `https://${domain}/play/watchbox.php?id=${subjectid}&se=${se}&ep=${ep}&dp=${encodeURIComponent(dp)}&na=${encodeURIComponent(na)}&ts=${timestamp}&sig=${signature}&nid=${movieId}&exten=1&tv=&token=`;
    
    try {
      const res = await axios.get(watchboxUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': REFERER,
        },
        timeout: 10000
      });
      
      const html = res.data;
      const success = html.includes('dl-item') || html.includes('r2.dev') || html.includes('.mp4') || html.includes('download-link');
      const failMsg = html.replace(/<[^>]*>/g, '').trim().slice(0, 60);
      console.log(`${domain}: ${success ? '🎉 SUCCESS! HTML length: ' + html.length : 'FAILED - ' + failMsg}`);
      if (success) {
        console.log('\n=== SUCCESS HTML (first 500 chars) ===');
        console.log(html.slice(0, 500));
        return;
      }
    } catch(e) {
      console.log(`${domain} Error:`, e.message.slice(0,80));
    }
  }
}

// Agent Kim Reactivated [Hindi], subjectid=847017270923651456, id=112516
testCorrectFormat(
  '847017270923651456',
  '112516', 
  'R2xjd0g4YTAzbCtoZ3psdThHNVI2c2pZTVROZ3BFbXh5WUJIdzVZVjlTZngwOU1lYzM0WXJLUXpac2g5d1FNSQ==',
  'Agent Kim Reactivated [Hindi]',
  '1', '1'
).catch(console.error);
