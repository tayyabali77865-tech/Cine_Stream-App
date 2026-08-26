const mongoose = require('mongoose');
const dns = require('dns');
require('dotenv').config();

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  console.log('[DNS] ✅ Public DNS servers configured (8.8.8.8, 1.1.1.1)');
} catch (err) {
  console.warn('[DNS] ⚠️ Failed to override process DNS servers:', err.message);
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    return;
  }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  // Query ReportedError
  const ReportedError = mongoose.model('ReportedError', new mongoose.Schema({}, { strict: false }));
  const CustomOverride = mongoose.model('CustomOverride', new mongoose.Schema({}, { strict: false }));

  const reported = await ReportedError.find({}).lean();
  console.log('Reported errors:', reported);

  const overrides = await CustomOverride.find({}).lean();
  console.log('Custom overrides:', overrides);

  await mongoose.disconnect();
}

run();
