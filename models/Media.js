const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  poster: { type: String },
  backdrop_path: { type: String },
  type: { type: String },
  rating: { type: String },
  releaseDate: { type: String },
  country: { type: String },
  badge: { type: String },
  categories: { type: [String], default: [] },
  filters: { type: [String], default: [] },
  // Full detail fields (populated on first user click)
  description: { type: String },
  seasons: { type: mongoose.Schema.Types.Mixed },
  audioLanguages: { type: [String], default: [] },
  trailer: { type: String },
  rawItem: { type: mongoose.Schema.Types.Mixed }, // Full upstream response
  detailsScrapedAt: { type: Date, default: null }, // When full details were last fetched
}, { timestamps: true });

// Indexes for faster querying
mediaSchema.index({ categories: 1 });
mediaSchema.index({ filters: 1 });
mediaSchema.index({ type: 1 });
mediaSchema.index({ detailsScrapedAt: 1 });

module.exports = mongoose.model('Media', mediaSchema);
