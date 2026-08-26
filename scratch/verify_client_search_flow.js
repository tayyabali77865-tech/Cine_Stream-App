const axios = require('axios');
const crypto = require('crypto');

async function verify() {
  const backendBase = 'http://localhost:8000/api';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    console.log('1. Testing backend /mirrors endpoint...');
    const timestamp1 = String(Date.now());
    const secretKey = 'cinestream_secret_secure_key_2026';
    const dataToSign1 = `/api/mirrors${timestamp1}`;
    const signature1 = crypto.createHmac('sha256', secretKey).update(dataToSign1).digest('hex');

    const mirrorsRes = await axios.get(`${backendBase}/mirrors`, {
      headers: {
        'X-Signature': signature1,
        'X-Timestamp': timestamp1
      }
    });
    console.log('   Mirrors response:', mirrorsRes.data);

    // Let's test using api2.imdb4.shop since it actually contains Demon Slayer
    const testMirror = 'https://api2.imdb4.shop/api';

    console.log('2. Simulating client direct search for "Demon Slayer" on:', testMirror);
    const searchUrl = `${testMirror}/search2/Demon+Slayer?page=0`;
    const searchRes = await axios.get(searchUrl, {
      headers: {
        ...headers,
        'Referer': 'https://netmirror.center/',
        'Origin': 'https://netmirror.center',
      }
    });
    const results = searchRes.data.results || [];
    console.log(`   Found ${results.length} search results on Netmirror directly.`);
    if (results.length === 0) {
      throw new Error('No search results found directly from Netmirror! Mirror might be blocked.');
    }

    const firstItem = results[0];
    console.log(`   First result: "${firstItem.title}" (ID: ${firstItem.id})`);

    console.log('3. Fetching details for first item directly from Netmirror...');
    const detailsUrl = `${testMirror}/movie/${firstItem.id}`;
    const detailsRes = await axios.get(detailsUrl, {
      headers: {
        ...headers,
        'Referer': 'https://netmirror.center/',
        'Origin': 'https://netmirror.center',
      }
    });
    const detailsItem = detailsRes.data.results ? detailsRes.data.results[0] : null;
    if (!detailsItem) {
      throw new Error('Failed to retrieve details from Netmirror directly!');
    }
    console.log(`   Details loaded: type=${detailsItem.media_type}, title=${detailsItem.title}`);

    console.log('4. Testing stream resolution POST request on backend...');
    const timestamp2 = String(Date.now());
    const endpoint = `/stream/${firstItem.id}?season=1&episode=1&lang=Hindi`;
    const dataToSign2 = `/api${endpoint}${timestamp2}`;
    const signature2 = crypto.createHmac('sha256', secretKey).update(dataToSign2).digest('hex');

    const streamRes = await axios.post(`${backendBase}${endpoint}`, 
      { item: detailsItem },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': signature2,
          'X-Timestamp': timestamp2
        }
      }
    );
    console.log('   Stream resolution SUCCESS!');
    console.log('   Video URL:', streamRes.data.videoUrl ? streamRes.data.videoUrl.substring(0, 100) + '...' : 'NONE');
    console.log('   Qualities:', streamRes.data.qualities);

  } catch (err) {
    console.error('❌ Verification failed:', err.message);
    if (err.response) {
      console.log('   Response status:', err.response.status);
      console.log('   Response data:', err.response.data);
    }
  }
}

verify();
