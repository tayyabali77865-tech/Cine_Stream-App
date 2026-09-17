const axios = require('axios');
const crypto = require('crypto');

const secretKey = 'cinestream_secret_secure_key_2026';
const id = '112516'; // Agent Kim Reactivated [Hindi]
const endpoint = '/stream/' + id + '?season=1&episode=1&lang=Hindi';
const timestamp = String(Date.now());
const dataToSign = '/api' + endpoint + timestamp;
const signature = crypto.createHmac('sha256', secretKey).update(dataToSign).digest('hex');

async function test() {
  console.log('Testing stream for Agent Kim (ID 112516)...');
  const res = await axios.post('http://localhost:8000/api' + endpoint, {}, {
    headers: {
      'X-Signature': signature,
      'X-Timestamp': timestamp,
      'Content-Type': 'application/json'
    },
    timeout: 60000
  });
  
  if (res.data.videoUrl) {
    console.log('🎉 SUCCESS! Video URL:', res.data.videoUrl);
    console.log('Qualities:', res.data.qualities ? res.data.qualities.map(q => q.quality + ' ' + q.size).join(', ') : 'none');
  } else {
    console.log('Response:', JSON.stringify(res.data, null, 2));
  }
}
test().catch(e => console.log('FAILED:', e.response ? JSON.stringify(e.response.data) : e.message));
