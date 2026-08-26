const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');

const secret = 'net###@@sss';

async function testReferer(referer) {
  try {
    const watchboxBaseUrl = 'https://speed.watch22.shop/play/watchdirect.php?id=QKZ/2Xq4PHpzhQOw7OokpVyOh7D6nKypV8i3j8W0oMOwoG9rZ7OcoW6sZbSfnlmsnqWc06Osn2KfnJ3Xn5pYnqVjZ2tsaqacpq1ra5yco2iwoG6sa7SfoG6r';
    
    console.log(`\nTesting watchdirect with Referer: "${referer}"...`);
    
    const dummyRes = await axios.get(watchboxBaseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(referer ? { 'Referer': referer } : {})
      },
      timeout: 5000
    });

    const timeMatch = dummyRes.data.match(/Time not Found\.<br><br>(\d+)/);
    if (!timeMatch) {
      console.log('Could not find server time');
      return;
    }
    const serverTime = timeMatch[1];
    const signature = crypto.createHmac('sha256', secret).update(String(serverTime)).digest('hex');
    const authUrl = `${watchboxBaseUrl}&ts=${serverTime}&sig=${signature}`;
    
    const authRes = await axios.get(authUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(referer ? { 'Referer': referer } : {})
      },
      timeout: 5000
    });

    const html = authRes.data;
    console.log("HTML length:", html.length);
    if (html.includes("Access Denied") || html.includes("challenge") || html.includes("Imunify360")) {
      console.log("Blocked by bot protection!");
      return;
    }

    const links = [];
    // Search for any source links
    const srcRegex = /(https?:\/\/[^\s"'`<>]+)/g;
    let match;
    while ((match = srcRegex.exec(html)) !== null) {
      links.add ? links.add(match[1]) : links.push(match[1]);
    }

    console.log(`All links found (${links.length}):`);
    const uniqueLinks = [...new Set(links)];
    uniqueLinks.slice(0, 10).forEach(l => {
      console.log(`- ${l.substring(0, 120)}...`);
    });

  } catch (err) {
    console.error(`Failed for referer "${referer}":`, err.message);
  }
}

async function run() {
  const referers = [
    'https://netmirror.global/',
    'https://netmirror.center/'
  ];
  for (const ref of referers) {
    await testReferer(ref);
  }
}

run();
