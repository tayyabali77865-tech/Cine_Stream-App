const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('watchbox.php')) {
      console.log('Intercepted Watchbox Response:', url, res.status());
      try {
         const text = await res.text();
         console.log("Watchbox Body:", text.substring(0, 200));
      } catch(e) {}
    }
  });

  console.log('Navigating to movie 123115...');
  await page.goto('https://netmirror.center/movie/123115/?embed=1', { waitUntil: 'networkidle2' });

  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
