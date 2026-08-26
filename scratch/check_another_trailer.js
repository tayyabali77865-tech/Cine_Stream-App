const axios = require('axios');

async function run() {
  const url = "https://archive.org/download/turner_video_133113/turner_video_133113.mp4";
  try {
    const res = await axios.head(url, { timeout: 5000 });
    console.log('Status:', res.status);
    console.log('Content-Type:', res.headers['content-type']);
    console.log('Content-Length:', res.headers['content-length']);
  } catch (err) {
    console.error('Failed:', err.message);
  }
}

run();
