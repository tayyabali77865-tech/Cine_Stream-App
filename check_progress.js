require('dotenv').config();
const mongoose = require('mongoose');
const Media = require('./models/Media');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const total = await Media.countDocuments();
  const byCategory = await Media.aggregate([
    { $unwind: '$categories' },
    { $group: { _id: '$categories', count: { $sum: 1 } } }
  ]);
  const withLinks = await Media.countDocuments({ videoLinks: { $ne: null } });
  console.log('=== SCRAPER PROGRESS ===');
  console.log('Total items in DB:', total);
  console.log('Items with video links:', withLinks);
  console.log('By category:');
  byCategory.forEach(c => console.log(' -', c._id, ':', c.count));
  await mongoose.disconnect();
}
check().catch(console.error);
