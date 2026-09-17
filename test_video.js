const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Navigating to movie 112234...');
  await page.goto('https://netmirror.center/movie/112234/?embed=1', { waitUntil: 'networkidle2' });
  
  try {
    const videoSrc = await page.evaluate(() => {
      const el = document.querySelector('video');
      return el ? (el.src || (el.querySelector('source') ? el.querySelector('source').src : null)) : null;
    });
    console.log('Video Source:', videoSrc);
  } catch (e) {
    console.log('No video tag found:', e.message);
  }

  const iframes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('iframe')).map(f => f.src);
  });
  console.log('Iframes:', iframes);

  await browser.close();
})();
