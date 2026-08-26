const crypto = require('crypto');
const axios = require('axios');

const secretKey = 'cinestream_secret_secure_key_2026';
const baseUrl = 'https://cinestream-app-production-640b.up.railway.app/api';
const endpoint = '/trending?page=0&filter=Latest&category=All';

const timestamp = String(Date.now());
const decodedEndpoint = decodeURIComponent(endpoint.replace(/\+/g, ' '));
const dataToSign = `/api${decodedEndpoint}${timestamp}`;
const signature = crypto.createHmac('sha256', secretKey).update(dataToSign).digest('hex');

const headers = {
  'X-Signature': signature,
  'X-Timestamp': timestamp
};

fetch(baseUrl + endpoint, { headers })
  .then(res => {
    console.log('Status:', res.status);
    return res.text();
  })
  .then(body => console.log('Body:', body))
  .catch(console.error);
