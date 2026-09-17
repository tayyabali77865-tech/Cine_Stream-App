const axios = require('axios');
const crypto = require('crypto');
const cheerio = require('cheerio');
const HM_SECRET = 'netmirror###@@sss';
const netmirrorReferer = 'https://netmirror.global/';

function getHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': netmirrorReferer
  };
}

async function extractWatchboxQualities(id, subjectid, dp) {
  const domain = 'limit.watch22.shop';
  try {
    const watchboxBaseUrl = 'https://' + domain + '/play/watchbox.php?id=' + subjectid + '&se=1&ep=1&dp=' + dp + '&na=&nid=' + id + '&exten=false&tv=&token=';
    
    const dummyRes = await axios.get(watchboxBaseUrl + '&ts=0&sig=0', { headers: getHeaders(), timeout: 6000 });
    
    const timeMatch = dummyRes.data.match(/Time not Found\.<br><br>(\d+)/);
    if (!timeMatch) return console.log("No time challenge!");
    
    const serverTime = timeMatch[1];
    
    // Try signature with ID
    const signature1 = crypto.createHmac('sha256', HM_SECRET).update(id + ':' + serverTime).digest('hex');
    const authRes1 = await axios.get(watchboxBaseUrl + '&ts=' + serverTime + '&sig=' + signature1, { headers: getHeaders(), timeout: 6000 });
    console.log("Sig1 with ID ("+id+"): length =", authRes1.data.length, authRes1.data.includes('Not Found') ? "FAIL" : "SUCCESS");

    // Try signature with SubjectID
    const signature2 = crypto.createHmac('sha256', HM_SECRET).update(subjectid + ':' + serverTime).digest('hex');
    const authRes2 = await axios.get(watchboxBaseUrl + '&ts=' + serverTime + '&sig=' + signature2, { headers: getHeaders(), timeout: 6000 });
    console.log("Sig2 with SubjectID ("+subjectid+"): length =", authRes2.data.length, authRes2.data.includes('Not Found') ? "FAIL" : "SUCCESS");

    // Try OLD signature with just time
    const signature3 = crypto.createHmac('sha256', HM_SECRET).update(serverTime).digest('hex');
    const authRes3 = await axios.get(watchboxBaseUrl + '&ts=' + serverTime + '&sig=' + signature3, { headers: getHeaders(), timeout: 6000 });
    console.log("Sig3 with just time: length =", authRes3.data.length, authRes3.data.includes('Not Found') ? "FAIL" : "SUCCESS");

  } catch (e) {
    console.error(e.message);
  }
}

extractWatchboxQualities('112234', '112234', '1');
