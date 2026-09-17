const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('api') || url.includes('similar') || url.includes('movie') || url.includes('tv')) {
       console.log('Response URL:', url);
       if (response.request().resourceType() === 'fetch' || response.request().resourceType() === 'xhr') {
          try {
             const text = await response.text();
             if (text.includes('similar') || text.includes('Similar')) {
                 console.log('FOUND SIMILAR IN URL:', url);
                 console.log('SNIPPET:', text.substring(0, 300));
             }
          } catch(e){}
       }
    }
  });
  console.log('Navigating...');
  await page.goto('https://netmirror.center/tv/3891', { waitUntil: 'networkidle2', timeout: 30000 });
  console.log('Done');
  await browser.close();
})();
