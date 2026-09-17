const axios = require('axios');
const crypto = require('crypto');
const netmirrorReferer = 'https://fmoviesunblocked.net/';

function getHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': netmirrorReferer
  };
}

async function runMatrix(id, subjectid) {
  const domain = 'limit.watch22.shop';
  const urls = [
    'https://' + domain + '/play/watchbox.php?id=' + subjectid + '&se=1&ep=1&dp=1&na=&nid=' + id + '&exten=false&tv=&token=',
    'https://' + domain + '/play/watchbox.php?id=' + subjectid + '&se=1&ep=1&dp=1&na=&exten=1'
  ];
  const secrets = ['netmirror###@@sss', 'N$h$M@#r#n#M$!v!$'];

  for (let u = 0; u < urls.length; u++) {
    const watchboxBaseUrl = urls[u];
    console.log("\\nTesting URL format " + u);
    
    try {
      const dummyRes = await axios.get(watchboxBaseUrl + '&ts=0&sig=0', { headers: getHeaders(), timeout: 6000 });
      const timeMatch = dummyRes.data.match(/Time not Found\\.<br><br>(\\d+)/);
      if (!timeMatch) { console.log("No time challenge!"); continue; }
      const serverTime = timeMatch[1];

      for (const secret of secrets) {
        console.log("Secret:", secret);
        // Try signature with ID
        const sig1 = crypto.createHmac('sha256', secret).update(id + ':' + serverTime).digest('hex');
        const res1 = await axios.get(watchboxBaseUrl + '&ts=' + serverTime + '&sig=' + sig1, { headers: getHeaders(), timeout: 6000 });
        if (!res1.data.includes('Not Found')) { console.log("SUCCESS Sig1 (id) with secret", secret); return; }

        // Try signature with SubjectID
        const sig2 = crypto.createHmac('sha256', secret).update(subjectid + ':' + serverTime).digest('hex');
        const res2 = await axios.get(watchboxBaseUrl + '&ts=' + serverTime + '&sig=' + sig2, { headers: getHeaders(), timeout: 6000 });
        if (!res2.data.includes('Not Found')) { console.log("SUCCESS Sig2 (subjectid) with secret", secret); return; }

        // Try signature with just time
        const sig3 = crypto.createHmac('sha256', secret).update(serverTime).digest('hex');
        const res3 = await axios.get(watchboxBaseUrl + '&ts=' + serverTime + '&sig=' + sig3, { headers: getHeaders(), timeout: 6000 });
        if (!res3.data.includes('Not Found')) { console.log("SUCCESS Sig3 (time) with secret", secret); return; }
      }
    } catch(e) {
      console.log(e.message);
    }
  }
  console.log("ALL FAILED.");
}

runMatrix('112234', '112234');
