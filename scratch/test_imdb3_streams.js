const axios = require('axios');
const crypto = require('crypto');

const secret = 'net###@@sss';

async function decrypt(data) {
  // Simple decryption logic matching server.js
  try {
    const key = Buffer.from('8ef46ef22e8d998d363d59ffbcbfde76', 'hex');
    const iv = Buffer.from('9df46ef22e8d998d363d59ffbcbfde76', 'hex');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    let decrypted = decipher.update(data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return null;
  }
}

async function resolveWatchdirect(url) {
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://netmirror.global/'
      },
      timeout: 5000
    });
    const html = res.data;
    const timeMatch = html.match(/Time not Found\.<br><br>(\d+)/);
    if (!timeMatch) return 'No time';
    const serverTime = timeMatch[1];
    const signature = crypto.createHmac('sha256', secret).update(String(serverTime)).digest('hex');
    const authUrl = `${url}&ts=${serverTime}&sig=${signature}`;
    
    const authRes = await axios.get(authUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://netmirror.global/'
      },
      timeout: 5000
    });

    const scriptRegex = /"(https:\/\/macdn\.hakunaymatata\.com\/cms\/[^"]+)"/g;
    const match = scriptRegex.exec(authRes.data);
    if (match) return match[1];
    return 'No link in HTML';
  } catch (err) {
    return 'Failed: ' + err.message;
  }
}

async function run() {
  const ids = ['122801', '122804', '122805', '122806', '122899'];
  for (const id of ids) {
    try {
      const res = await axios.get(`https://api2.imdb3.shop/api/movie/${id}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://netmirror.global/'
        },
        timeout: 4000
      });
      
      const item = res.data.results[0];
      const embedJson = item.embed_json;
      if (!embedJson || embedJson.length === 0) {
        console.log(`No embed_json for ${id}`);
        continue;
      }
      
      const decrypted = await decrypt(embedJson[0].url);
      const watchUrl = `https://speed.watch22.shop/play/watchdirect.php?id=${decrypted}`;
      const streamLink = await resolveWatchdirect(watchUrl);
      
      const expiresMatch = streamLink.match(/[?&]Expires=(\d+)/);
      const expires = expiresMatch ? expiresMatch[1] : 'none';
      const isExpired = expires !== 'none' && (parseInt(expires, 10) * 1000 < Date.now());
      
      console.log(`ID ${id}:`);
      console.log(`- Resolved Link: ${streamLink.substring(0, 100)}...`);
      console.log(`- Expiry: ${expires} (${new Date(expires * 1000).toLocaleString()})`);
      console.log(`- Is Expired: ${isExpired}`);
    } catch (err) {
      console.log(`❌ Failed for ${id}:`, err.message);
    }
  }
}

run();
