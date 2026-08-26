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
  await mongoose.connect(uri);
  const CustomOverride = mongoose.model('CustomOverride', new mongoose.Schema({}, { strict: false }));
  const doc = await CustomOverride.findOne({ id: '122095' }).lean();
  console.log('Override for 122095:', JSON.stringify(doc, null, 2));
  await mongoose.disconnect();
}

run();
