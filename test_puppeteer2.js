const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('https://netmirror.center/tv/3891', { waitUntil: 'networkidle0', timeout: 30000 });
  
  const similarSection = await page.evaluate(() => {
    // Attempt to find the similar/related section
    const headings = Array.from(document.querySelectorAll('h2, h3, h4, div'));
    const similarHeading = headings.find(h => h.innerText && h.innerText.toLowerCase().includes('similar'));
    if (!similarHeading) return { error: 'No similar heading found' };
    
    // Get its parent or sibling container with cards
    let container = similarHeading.nextElementSibling || similarHeading.parentElement;
    const cards = Array.from(document.querySelectorAll('.movie-card, .card, a[title], .item, .movies-list .ml-item'));
    return {
       heading: similarHeading.innerText,
       allLinkTitles: Array.from(document.querySelectorAll('a')).map(a => a.innerText || a.title).filter(t => t && t.length > 3).slice(0, 30)
    };
  });
  console.log('DOM similar check:', JSON.stringify(similarSection, null, 2));
  await page.screenshot({ path: 'netmirror_3891.webp' });
  await browser.close();
})();
