const axios = require('axios');

const WATCHBOX_DOMAINS = [
  'speed.watch22.shop',
  'play.watch22.shop',
  'play.watch21.shop',
  'test.watch22.shop',
  'playnew.watch21.shop'
];

async function test() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://netmirror.global/'
  };

  for (const d of WATCHBOX_DOMAINS) {
    const start = Date.now();
    try {
      // Check port 443 with a basic GET to the domain root or script
      const url = `https://${d}/play/watchbox.php?id=0&se=0&ep=0&dp=0&na=0&exten=1&ts=0&sig=0`;
      await axios.get(url, { headers, timeout: 5000 });
      console.log(`[${d}] SUCCESS in ${Date.now() - start}ms`);
    } catch (e) {
      console.log(`[${d}] FAILED in ${Date.now() - start}ms - ${e.message}`);
    }
  }
}

test();
