const crypto = require('crypto');
const axios = require('axios');

// Start the server
console.log('Starting server...');
process.env.PORT = '8005'; // Use a different port to avoid conflicts
require('../server.js');

// Give the server a moment to start up and discover mirrors
setTimeout(async () => {
  try {
    const timestamp = String(Date.now());
    const secretKey = process.env.API_KEY || 'cinestream_secret_secure_key_2026';
    
    // 1. Verify Details API
    const endpointDetails = '/api/details/122104';
    const dataToSignDetails = endpointDetails + timestamp;
    const signatureDetails = crypto.createHmac('sha256', secretKey).update(dataToSignDetails).digest('hex');
    
    console.log('Fetching details for 122104...');
    const detailsRes = await axios.get('http://localhost:8005/api/details/122104', {
      headers: {
        'X-Signature': signatureDetails,
        'X-Timestamp': timestamp
      }
    });
    
    console.log('Response type:', detailsRes.data.type);
    console.log('Response seasons:', detailsRes.data.seasons);
    
    if (detailsRes.data.type === 'Movie' && detailsRes.data.seasons === null) {
      console.log('✅ Movie details check PASSED');
    } else {
      console.error('❌ Movie details check FAILED');
      process.exit(1);
    }
    
    // 2. Verify Search HMAC Match with spaces (Admin panel logic simulation)
    const query = 'Enola Holmes 3';
    const clientEndpoint = `/search?q=${encodeURIComponent(query)}`; // '/search?q=Enola%20Holmes%203'
    
    // Decoded endpoint like client & server now both do:
    const decodedEndpoint = decodeURIComponent(clientEndpoint.replace(/\+/g, ' ')); // '/search?q=Enola Holmes 3'
    const clientDataToSign = `/api${decodedEndpoint}${timestamp}`;
    const clientSignature = crypto.createHmac('sha256', secretKey).update(clientDataToSign).digest('hex');
    
    console.log('Searching for Enola Holmes 3...');
    const searchRes = await axios.get(`http://localhost:8005/api/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'X-Signature': clientSignature,
        'X-Timestamp': timestamp
      }
    });
    
    console.log('Search Results count:', searchRes.data.length);
    console.log('✅ Admin Panel Search Signature check PASSED');
    process.exit(0);
  } catch (err) {
    console.error('Verification failed with error:', err.response ? err.response.data : err.message);
    process.exit(1);
  }
}, 3000);
