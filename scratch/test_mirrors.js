const fetch = require('node-fetch');
const CryptoJS = require('crypto-js');

const secretKey = 'cinestream_secret_secure_key_2026'; // fallback key in apiService.js

async function testBackend() {
  const endpoint = '/mirrors';
  const timestamp = String(Date.now());
  const dataToSign = `/api${endpoint}${timestamp}`;
  const signature = CryptoJS.HmacSHA256(dataToSign, secretKey).toString(CryptoJS.enc.Hex);

  const headers = {
    'X-Signature': signature,
    'X-Timestamp': timestamp
  };

  try {
    const res = await fetch(`https://cinestream-app-production-68d6.up.railway.app/api${endpoint}`, { headers });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Data:', data);
  } catch (err) {
    console.error('Error fetching mirrors:', err.message);
  }
}

testBackend();
