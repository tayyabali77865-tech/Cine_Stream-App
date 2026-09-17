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

async function extractWatchboxQualities(id, subjectid, se, ep, dp, na) {
  const WATCHBOX_DOMAINS = [
    'limit.watch22.shop',
    'dv.watch22.shop'
  ];

  for (const domain of WATCHBOX_DOMAINS) {
    try {
      console.log('Trying', domain);
      const watchboxBaseUrl = 'https://' + domain + '/play/watchbox.php?id=' + subjectid + '&se=' + se + '&ep=' + ep + '&dp=' + dp + '&na=' + encodeURIComponent(na) + '&exten=1';
      
      const dummyRes = await axios.get(watchboxBaseUrl + '&ts=0&sig=0', {
        headers: getHeaders(),
        timeout: 6000
      });
      
      const timeMatch = dummyRes.data.match(/Time not Found\.<br><br>(\d+)/);
      if (!timeMatch) {
         console.log("No time challenge!");
         continue;
      }
      const serverTime = timeMatch[1];
      console.log("Server time:", serverTime);

      const signature = crypto.createHmac('sha256', HM_SECRET).update(id + ':' + serverTime).digest('hex');
      
      const authRes = await axios.get(watchboxBaseUrl + '&ts=' + serverTime + '&sig=' + signature, {
        headers: getHeaders(),
        timeout: 6000
      });
      
      const html = authRes.data;
      console.log("Auth length:", html.length);
      if (html.includes('Not Found')) {
        console.log("Not found or Come from listed website");
      }

      const $ = cheerio.load(html);
      const qualities = [];

      $('.dl.if_ext').each((i, el) => {
        const text = $(el).parent().text().trim();
        const qualityMatch = text.match(/(\d{3,4}[Pp])/);
        const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(GB|MB|KB)/i);
    
        const onclick = $(el).attr('onclick') || '';
        const urlMatch = onclick.match(/myFunction(?:_dl)?\s*\(\s*['"]([^'"]+)['"]/);
        
        if (qualityMatch && urlMatch) {
          qualities.push({
            quality: qualityMatch[1].toUpperCase(),
            size: sizeMatch ? sizeMatch[1] + ' ' + sizeMatch[2].toUpperCase() : 'N/A',
            url: urlMatch[1]
          });
        }
      });
      console.log("Extracted:", qualities);

    } catch (e) {
      console.error(e.message);
    }
  }
}

// Test with 112234
extractWatchboxQualities('112234', '112234', '1', '1', '1', '');
