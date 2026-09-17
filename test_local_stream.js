const axios = require('axios');

async function test() {
  try {
    const res = await axios.get('http://192.168.0.40:8000/api/stream/112234', {
      headers: {
        'x-api-key': 'cinestream_secret_secure_key_2026'
      }
    });
    console.log("SUCCESS:", res.data);
  } catch (err) {
    console.error("FAILED:", err.response ? err.response.data : err.message);
  }
}
test();
