const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  page.on('request', req => {
    if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch' || req.resourceType() === 'document' || req.resourceType() === 'sub_document') {
       console.log('Req:', req.resourceType(), req.url());
    }
  });

  await page.goto('https://netmirror.center/movie/112234', { waitUntil: 'networkidle2' });

  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
