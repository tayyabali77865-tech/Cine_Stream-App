const mongoose = require('mongoose');

// ─── Schemas ─────────────────────────────────────────────────────────────────

const deletedMediaSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true, index: true },
  title:     { type: String, default: 'Unknown Title' },
  deletedAt: { type: String, default: () => new Date().toISOString() }
});

const customOverrideSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true, index: true },
  links:     { type: mongoose.Schema.Types.Mixed, default: [] },
  updatedAt: { type: String, default: () => new Date().toISOString() }
});

const DeletedMedia   = mongoose.model('DeletedMedia',   deletedMediaSchema);
const CustomOverride = mongoose.model('CustomOverride', customOverrideSchema);

// ─── In-Memory Fallback (if MongoDB is offline) ───────────────────────────────

let fallbackDeletedIds  = [];
let fallbackOverrides   = {};
let isConnected         = false;

// ─── Connection ───────────────────────────────────────────────────────────────

async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[MongoDB] MONGODB_URI not set. Using in-memory fallback.');
    return;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    isConnected = true;
    console.log('[MongoDB] ✅ Connected to MongoDB Atlas successfully.');
  } catch (err) {
    isConnected = false;
    console.error('[MongoDB] ❌ Connection failed. Using in-memory fallback.', err.message);
  }

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('[MongoDB] ⚠️ Disconnected from MongoDB. Falling back to memory.');
  });
  mongoose.connection.on('reconnected', () => {
    isConnected = true;
    console.log('[MongoDB] ✅ Reconnected to MongoDB Atlas.');
  });
}

function getStatus() {
  return isConnected ? 'connected' : 'fallback (in-memory)';
}

// ─── Deleted Media Operations ─────────────────────────────────────────────────

async function isDeleted(id) {
  const idStr = String(id);
  if (!isConnected) {
    return fallbackDeletedIds.some(item =>
      typeof item === 'object' ? item.id === idStr : item === idStr
    );
  }
  try {
    const doc = await DeletedMedia.findOne({ id: idStr }).lean();
    return !!doc;
  } catch (err) {
    console.error('[MongoDB] isDeleted error:', err.message);
    return false;
  }
}

async function addDeleted(id, title = 'Unknown Title') {
  const idStr = String(id);
  if (!isConnected) {
    const exists = fallbackDeletedIds.some(item =>
      typeof item === 'object' ? item.id === idStr : item === idStr
    );
    if (!exists) fallbackDeletedIds.push({ id: idStr, title, deletedAt: new Date().toISOString() });
    return;
  }
  try {
    await DeletedMedia.updateOne(
      { id: idStr },
      { id: idStr, title, deletedAt: new Date().toISOString() },
      { upsert: true }
    );
  } catch (err) {
    console.error('[MongoDB] addDeleted error:', err.message);
  }
}

async function removeDeleted(id) {
  const idStr = String(id);
  if (!isConnected) {
    fallbackDeletedIds = fallbackDeletedIds.filter(item =>
      typeof item === 'object' ? item.id !== idStr : item !== idStr
    );
    return;
  }
  try {
    await DeletedMedia.deleteOne({ id: idStr });
  } catch (err) {
    console.error('[MongoDB] removeDeleted error:', err.message);
  }
}

async function getAllDeleted() {
  if (!isConnected) {
    return fallbackDeletedIds.map(item =>
      typeof item === 'object' ? item : { id: String(item), title: 'Unknown', deletedAt: 'N/A' }
    );
  }
  try {
    return await DeletedMedia.find({}, { _id: 0, __v: 0 }).lean();
  } catch (err) {
    console.error('[MongoDB] getAllDeleted error:', err.message);
    return [];
  }
}

// ─── Custom Override Operations ───────────────────────────────────────────────

async function getOverride(id) {
  const idStr = String(id);
  if (!isConnected) {
    return fallbackOverrides[idStr] || null;
  }
  try {
    const doc = await CustomOverride.findOne({ id: idStr }).lean();
    return doc ? doc.links : null;
  } catch (err) {
    console.error('[MongoDB] getOverride error:', err.message);
    return null;
  }
}

async function setOverride(id, links) {
  const idStr = String(id);
  if (!isConnected) {
    fallbackOverrides[idStr] = links;
    return;
  }
  try {
    await CustomOverride.updateOne(
      { id: idStr },
      { id: idStr, links, updatedAt: new Date().toISOString() },
      { upsert: true }
    );
  } catch (err) {
    console.error('[MongoDB] setOverride error:', err.message);
  }
}

async function deleteOverride(id) {
  const idStr = String(id);
  if (!isConnected) {
    delete fallbackOverrides[idStr];
    return;
  }
  try {
    await CustomOverride.deleteOne({ id: idStr });
  } catch (err) {
    console.error('[MongoDB] deleteOverride error:', err.message);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  connectMongo,
  getStatus,
  isDeleted,
  addDeleted,
  removeDeleted,
  getAllDeleted,
  getOverride,
  setOverride,
  deleteOverride
};
