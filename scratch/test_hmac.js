const CryptoJS = require('crypto-js');

const secretKey = 'cinestream_secret_secure_key_2026';
const endpoint = '/trending?page=0&filter=Latest&category=All';

const timestamp = String(Date.now());
const decodedEndpoint = decodeURIComponent(endpoint.replace(/\+/g, ' '));
const dataToSign = `/api${decodedEndpoint}${timestamp}`;
const signature = CryptoJS.HmacSHA256(dataToSign, secretKey).toString(CryptoJS.enc.Hex);

const headers = {
  'X-Signature': signature,
  'X-Timestamp': timestamp
};

fetch(`http://127.0.0.1:8000/api${endpoint}`, { headers })
  .then(async res => {
    console.log('Status:', res.status);
    console.log('Body:', await res.text());
  })
  .catch(err => console.error(err));
