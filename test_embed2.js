const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Navigating to movie 112234...');
  await page.goto('https://netmirror.center/movie/112234/?embed=1', { waitUntil: 'networkidle2' });

  const html = await page.content();
  console.log(html.substring(0, 1000));
  
  // Look for any iframes
  const iframes = await page.$$eval('iframe', frames => frames.map(f => f.src));
  console.log('Iframes:', iframes);

  await browser.close();
})();
