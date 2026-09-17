const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  let watchboxUrl = null;

  page.on('request', request => {
    const url = request.url();
    if (url.includes('watchbox.php')) {
      console.log('Intercepted Watchbox URL:', url);
      watchboxUrl = url;
    }
  });

  console.log('Navigating to movie 112234...');
  await page.goto('https://netmirror.center/movie/112234/?embed=1', { waitUntil: 'networkidle2' });

  // wait for iframe
  await page.waitForSelector('iframe');
  
  // wait 5 seconds
  await new Promise(r => setTimeout(r, 5000));

  await browser.close();
})();
