const axios = require('axios');
const crypto = require('crypto');
const secretKey = 'cinestream_secret_secure_key_2026';
const timestamp = Date.now().toString();
const url = '/api/details/103375';
const dataToSign = url + timestamp;
const signature = crypto.createHmac('sha256', secretKey).update(dataToSign).digest('hex');

axios.get(`http://localhost:8000${url}`, {
  headers: {
    'x-timestamp': timestamp,
    'x-signature': signature
  }
})
  .then(res => {
     const keys = Object.keys(res.data._rawItem);
     console.log('Keys in _rawItem:', keys.join(', '));
     if (res.data._rawItem.similar) {
       console.log('Similar exists! Length:', res.data._rawItem.similar.length);
     } else {
       console.log('Similar not found directly in _rawItem.');
     }
  })
  .catch(err => console.error(err.response ? err.response.data : err.message));
