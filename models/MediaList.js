const mongoose = require('mongoose');

const mediaListSchema = new mongoose.Schema({
  category: { type: String, required: true },
  filter: { type: String, required: true },
  items: [{ type: String }], // Array of Media IDs in exact order
  lastUpdated: { type: Date, default: Date.now }
});

mediaListSchema.index({ category: 1, filter: 1 }, { unique: true });

module.exports = mongoose.model('MediaList', mediaListSchema);
