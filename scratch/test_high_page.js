const fetch = require('node-fetch');
const CryptoJS = require('crypto-js');

const secretKey = 'cinestream_secret_secure_key_2026';
const BASE = 'https://cinestream-app-production-68d6.up.railway.app/api';

async function signedFetch(endpoint) {
  const timestamp = String(Date.now());
  const decodedUrl = decodeURIComponent(`/api${endpoint}`.replace(/\+/g, ' '));
  const dataToSign = `${decodedUrl}${timestamp}`;
  const signature = CryptoJS.HmacSHA256(dataToSign, secretKey).toString(CryptoJS.enc.Hex);
  
  const res = await fetch(`${BASE}${endpoint}`, {
    headers: { 'X-Signature': signature, 'X-Timestamp': timestamp }
  });
  return res;
}

async function checkHighPage() {
  try {
    // Test fetch trending for Page 8
    const endpoint = `/trending?page=8&filter=Trending&category=All`;
    console.log('Verifying Railway Deployment Status for High Page Fetch...');
    console.log('Calling:', `${BASE}${endpoint}`);
    const res = await signedFetch(endpoint);
    console.log('HTTP Status code:', res.status);
    const data = await res.json();
    if (res.ok) {
      console.log(`Success! Total elements retrieved: ${data.length}`);
      if(data.length > 0) {
         console.log(`First item on Page 8: [${data[0].id}] ${data[0].title}`);
      }
    } else {
      console.log('Error payload:', data);
    }
  } catch (err) {
    console.error('Fetch Exception:', err.message);
  }
}

checkHighPage();
