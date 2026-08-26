const fetch = require('node-fetch');
const CryptoJS = require('crypto-js');

const secretKey = 'cinestream_secret_secure_key_2026';
const BASE = 'https://cinestream-app-production-68d6.up.railway.app/api';

async function signedFetch(endpoint) {
  const timestamp = String(Date.now());
  // Server signs: decodeURIComponent(req.originalUrl.replace(/\+/g, ' ')) + timestamp
  const fullUrl = `/api${endpoint}`;
  const decodedUrl = decodeURIComponent(fullUrl.replace(/\+/g, ' '));
  const dataToSign = `${decodedUrl}${timestamp}`;
  const signature = CryptoJS.HmacSHA256(dataToSign, secretKey).toString(CryptoJS.enc.Hex);
  const res = await fetch(`${BASE}${endpoint}`, {
    headers: { 'X-Signature': signature, 'X-Timestamp': timestamp }
  });
  return res;
}

async function testSearch() {
  try {
    const query = 'demon slayer';
    const endpoint = `/search?q=${encodeURIComponent(query)}&page=0`;
    console.log('Calling backend:', `${BASE}${endpoint}`);
    const res = await signedFetch(endpoint);
    console.log('Status:', res.status);
    const data = await res.json();
    if (Array.isArray(data)) {
      console.log(`Total results: ${data.length}`);
      data.slice(0, 5).forEach(item => console.log(`  - [${item.id}] ${item.title}`));
    } else {
      console.log('Response:', data);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testSearch();
