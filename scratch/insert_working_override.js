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

  // We will insert the fresh, working CDN URL that you just shared
  const freshUrl = "https://macdn.hakunaymatata.com/cms/14e9cbdbc13164a5edd510fc4f8ae63a.mp4?Expires=1786358295&Signature=DMFw6lHDAc6cHBdUaTES95IeHoO~P6pAsmD83r2eGnd6qQSSdf5LctuFKYTf~vuC-nJWAtxmOUUq0BVACRvqlCqZ6~lyDxkUj7BCeF1AjSiXYWBKtjwXGBTpV8VTP-VLASmIK4R-JzhAxYw0K8GeeAlRr784PUYIRnIzIvpvId1qUVo9j5bMM3~YycWP7zBmt0470Mg~JkwOM0CSwmuxo189iQiPyl8zyaxHV9go4Bea7dQ26ma61ItEUj2VwcxYFdxVkUooGB2OFHA1KmXIwDLa71OnKnOapWjADfnxolYiam2d7xu6TY9GP-D1dLrjgqw2fwyrmhrQ~V2vJOOdUw__&Key-Pair-Id=KMHN1LQ1HEUPL";
  
  const overrideLinks = [
    {
      quality: '1080P',
      size: '3.0 GB',
      url: freshUrl
    }
  ];

  // We override it for Hindi version (122804) which you tested
  await CustomOverride.updateOne(
    { id: '122804' },
    {
      id: '122804',
      links: overrideLinks,
      updatedAt: new Date().toISOString()
    },
    { upsert: true }
  );
  console.log(`✅ Successfully set working CDN override for ID: 122804`);

  await mongoose.disconnect();
}

run();
