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
    console.log('Querying details for 122804...');
    const details = await customFetch('/details/122804');

    console.log('Querying stream for 122804 (Hindi)...');
    const timestamp = String(Date.now());
    const dataToSign = `/api/stream/122804?season=&episode=&lang=Hindi${timestamp}`;
    const signature = CryptoJS.HmacSHA256(dataToSign, secretKey).toString(CryptoJS.enc.Hex);

    const streamRes = await axios.post(
      `${PROD_URL}/api/stream/122804?season=&episode=&lang=Hindi`,
      { item: details._rawItem },
      {
        headers: {
          'X-Signature': signature,
          'X-Timestamp': timestamp,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Response status:', streamRes.status);
    console.log('Headers:', streamRes.headers);
    console.log('Stream Response:', JSON.stringify(streamRes.data, null, 2));

  } catch (err) {
    console.error('Error:', err.response ? err.response.status + ' ' + JSON.stringify(err.response.data) : err.message);
  }
}

run();
