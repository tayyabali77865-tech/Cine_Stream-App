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
    id: String
  }, { collection: 'customoverrides' }));

  // IDs to remove overrides for (excluding Hindi 122804)
  const idsToRemove = ['122801', '122805', '122806', '122899'];

  const deleteRes = await CustomOverride.deleteMany({ id: { $in: idsToRemove } });
  console.log(`✅ Successfully removed overrides for ${deleteRes.deletedCount} languages. Hindi override is preserved.`);

  await mongoose.disconnect();
}

run();
