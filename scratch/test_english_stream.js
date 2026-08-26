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
    console.log('Querying details for 122801 (Spider-Man: Brand New Day English) from PROD...');
    const details = await customFetch('/details/122801');
    console.log('Details:', JSON.stringify(details, null, 2));

    console.log('Querying stream for 122801 (English) from PROD...');
    const timestamp = String(Date.now());
    const dataToSign = `/api/stream/122801?season=&episode=&lang=English${timestamp}`;
    const signature = CryptoJS.HmacSHA256(dataToSign, secretKey).toString(CryptoJS.enc.Hex);

    const streamRes = await axios.post(
      `${PROD_URL}/api/stream/122801?season=&episode=&lang=English`,
      { item: details._rawItem },
      {
        headers: {
          'X-Signature': signature,
          'X-Timestamp': timestamp,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Stream Response:', JSON.stringify(streamRes.data, null, 2));

  } catch (err) {
    console.error('Error:', err.response ? err.response.status + ' ' + JSON.stringify(err.response.data) : err.message);
  }
}

run();
