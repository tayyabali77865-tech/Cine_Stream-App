const axios = require('axios');
const CryptoJS = require('crypto-js');

const secretKey = 'cinestream_secret_secure_key_2026';
const PROD_URL = 'https://cinestream-app-production-68d6.up.railway.app';

async function customFetch(endpoint) {
  const timestamp = String(Date.now());
  const decodedEndpoint = decodeURIComponent(endpoint.replace(/\+/g, ' '));
  const dataToSign = `/api${decodedEndpoint}${timestamp}`;
  const signature = CryptoJS.HmacSHA256(dataToSign, secretKey).toString(CryptoJS.enc.Hex);

  const headers = {
    'X-Signature': signature,
    'X-Timestamp': timestamp
  };

  const response = await axios.get(`${PROD_URL}/api${endpoint}`, { headers });
  return response.data;
}

async function run() {
  try {
    console.log('Searching for Spider-Man Brand New Day on production server...');
    const results = await customFetch('/search?q=Spider%20Man%20Brand%20New%20Day&page=0');
    console.log('Results:', JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('Error:', err.response ? err.response.status + ' ' + JSON.stringify(err.response.data) : err.message);
  }
}

run();
