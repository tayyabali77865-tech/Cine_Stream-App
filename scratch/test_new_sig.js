const axios = require('axios');
const crypto = require('crypto');

const HM_SECRET = 'net###@@sss';
const REFERER = 'https://fmoviesunblocked.net/';

// Also try the nid parameter - from JS bundle: &nid=Qt (Qt is a different id from the movie, maybe subjectid?)
async function testNewSig(id, subjectid, dp, title) {
  const na = Buffer.from(title).toString('base64');
  const domain = 'limit.watch22.shop';
  
  // The JS bundle uses: watchbox.php?id=Ce&se=He&ep=bt&dp=Cr&na=...
  // Then appends: &ts=r&sig=n&nid=Qt&exten=i
  // Qt appears to be a different id (maybe 0 or subjectid), i = exten
  
  // Try different watchbox URL formats:
  const formats = [
    // Format 1: no nid
    `https://${domain}/play/watchbox.php?id=${id}&se=&ep=&dp=${encodeURIComponent(dp)}&na=${encodeURIComponent(na)}&exten=1`,
    // Format 2: with nid=id
    `https://${domain}/play/watchbox.php?id=${id}&se=&ep=&dp=${encodeURIComponent(dp)}&na=${encodeURIComponent(na)}&exten=1&nid=${id}`,
    // Format 3: with nid=subjectid
    `https://${domain}/play/watchbox.php?id=${id}&se=&ep=&dp=${encodeURIComponent(dp)}&na=${encodeURIComponent(na)}&exten=1&nid=${subjectid}`,
    // Format 4: older url format with id=subjectid
    `https://${domain}/play/watchbox.php?id=${subjectid}&se=&ep=&dp=${encodeURIComponent(dp)}&na=${encodeURIComponent(na)}&exten=1&nid=${id}`,
  ];
  
  for (let i = 0; i < formats.length; i++) {
    const watchboxBaseUrl = formats[i];
    console.log(`\nTesting Format ${i+1}:`, watchboxBaseUrl.slice(0, 120));
    
    try {
      const dummyRes = await axios.get(`${watchboxBaseUrl}&ts=0&sig=0`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': REFERER },
        timeout: 6000
      });
      
      const timeMatch = dummyRes.data.match(/Time not Found\.<br><br>(\d+)/);
      if (!timeMatch) {
        console.log('No time challenge, response:', dummyRes.data.slice(0, 80));
        continue;
      }
      
      const serverTime = timeMatch[1];
      
      // Try 3 signature variants:
      const sigVariants = [
        { name: 'id:time', msg: `${id}:${serverTime}` },
        { name: 'subjectid:time', msg: `${subjectid}:${serverTime}` },
        { name: 'time only', msg: serverTime },
        { name: 'id:time (Math.floor/1000)', msg: `${id}:${Math.floor(parseInt(serverTime)/1000)}` },
      ];
      
      for (const variant of sigVariants) {
        const signature = crypto.createHmac('sha256', HM_SECRET).update(variant.msg).digest('hex');
        const authRes = await axios.get(`${watchboxBaseUrl}&ts=${serverTime}&sig=${signature}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': REFERER },
          timeout: 6000
        });
        const html = authRes.data;
        if (html.includes('dl-item') || html.includes('r2.dev') || html.includes('download-link')) {
          console.log(`🎉 SUCCESS! Format ${i+1}, Sig: ${variant.name}, HTML length: ${html.length}`);
          return;
        } else {
          console.log(`  Sig "${variant.name}": FAILED -`, html.slice(80, 110).replace(/\n/g, ''));
        }
      }
    } catch(e) {
      console.log('Error:', e.message);
    }
  }
}

testNewSig(
  '112234',
  '2897664112366868144',
  'UVYxN2tlWDJFQVZBT09EbitiY1U3N0xnSFpMNWg3bXBHbVMrcEV1TjFiWEJKajB3ZHRIemdvM3UwS2M4UDRPYg==',
  'Cocktail 2 [Hindi]'
).catch(console.error);
