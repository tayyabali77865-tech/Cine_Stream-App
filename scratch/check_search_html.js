const axios = require('axios');

async function checkSearchHtml() {
  const url = 'https://netmirror.center/search/Moana';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    console.log(`Fetching HTML from: ${url}`);
    const res = await axios.get(url, { headers, timeout: 10000 });
    console.log('Status code:', res.status);
    console.log('HTML Length:', res.data.length);
    
    // Check if there are any movie titles or results in the HTML directly
    if (res.data.includes('Moana')) {
      console.log('Found "Moana" in the HTML source!');
    } else {
      console.log('"Moana" NOT found in the HTML source.');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkSearchHtml();
