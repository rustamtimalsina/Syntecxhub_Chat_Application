const mongoose = require('mongoose');

const readStateSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastReadAt: { type: Date, default: Date.now },
});

readStateSchema.index({ conversation: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('ReadState', readStateSchema);