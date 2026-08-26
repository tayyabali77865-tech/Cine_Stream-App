const mongoose = require('mongoose');
const dns = require('dns');
require('dotenv').config();

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (err) {
  console.warn(err.message);
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    return;
  }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const CustomOverride = mongoose.model('CustomOverride', new mongoose.Schema({
    id:        { type: String, required: true, unique: true, index: true },
    links:     { type: mongoose.Schema.Types.Mixed, default: [] },
    updatedAt: { type: String, default: () => new Date().toISOString() }
  }, { collection: 'customoverrides' }));

  const idsToOverride = ['122804', '122801', '122805', '122806', '122899'];
  
  // We'll use the febspot MP4 link which is confirmed to be working for other overrides
  const overrideLinks = [
    {
      quality: '720P',
      size: 'Auto',
      url: 'https://st81.febspot.com/videos/3300000/3300823/3300823_720p.mp4'
    }
  ];

  for (const id of idsToOverride) {
    await CustomOverride.updateOne(
      { id: id },
      {
        id: id,
        links: overrideLinks,
        updatedAt: new Date().toISOString()
      },
      { upsert: true }
    );
    console.log(`✅ Updated CustomOverride to febspot for ID: ${id}`);
  }

  await mongoose.disconnect();
}

run();
