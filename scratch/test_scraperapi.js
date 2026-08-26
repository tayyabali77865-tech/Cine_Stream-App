const axios = require('axios');

async function run() {
  const apiKey = 'e229f1ace086ca4a7342628ab5ea67fd';
  const targetUrl = 'https://api2.imdb4.shop/api/movie/122804';
  
  // Try standard mode first with 30s timeout
  console.log('1. Trying ScraperAPI in STANDARD mode...');
  const urlStandard = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}`;
  try {
    const res = await axios.get(urlStandard, { timeout: 30000 });
    console.log('✅ STANDARD SUCCESS!');
    console.log('Data:', JSON.stringify(res.data).substring(0, 300));
    return;
  } catch (err) {
    console.log('❌ STANDARD FAILED:', err.message);
  }

  // Try JS Render mode
  console.log('\n2. Trying ScraperAPI in JS RENDER mode...');
  const urlRender = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}&render=true`;
  try {
    const res = await axios.get(urlRender, { timeout: 45000 });
    console.log('✅ JS RENDER SUCCESS!');
    console.log('Data:', JSON.stringify(res.data).substring(0, 300));
  } catch (err) {
    console.log('❌ JS RENDER FAILED:', err.message);
  }
}

run();
