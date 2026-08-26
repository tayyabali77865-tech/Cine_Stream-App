const axios = require('axios');
const CryptoJS = require('crypto-js');

const URL = 'http://localhost:8000/api';
const secretKey = 'cinestream_secret_secure_key_2026';

function getSignedHeaders(endpoint) {
  const timestamp = String(Date.now());
  const decodedEndpoint = decodeURIComponent(endpoint.replace(/\+/g, ' '));
  const dataToSign = `/api${decodedEndpoint}${timestamp}`;
  const signature = CryptoJS.HmacSHA256(dataToSign, secretKey).toString(CryptoJS.enc.Hex);
  return {
    'X-Signature': signature,
    'X-Timestamp': timestamp
  };
}

async function check() {
  const categories = ['All', 'Movies', 'Series', 'Anime'];
  for (const cat of categories) {
    const endpoint = `/trending?page=8&filter=Trending&category=${cat}`;
    const headers = getSignedHeaders(endpoint);
    try {
      const res = await axios.get(`${URL}${endpoint}`, { headers });
      console.log(`Category: ${cat}, Page 8 count: ${res.data.length}`);
      if (res.data.length > 0) {
        console.log(`First item: ${res.data[0].title}`);
      }
    } catch (e) {
      console.log(`Category ${cat} failed:`, e.message, e.response ? e.response.status : '');
    }
  }
}

check();
