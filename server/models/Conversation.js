const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['channel', 'dm'], required: true },
    name: { type: String, trim: true, maxlength: 40 },        // channels only
    slug: { type: String, unique: true, sparse: true },       // channels only
    description: { type: String, trim: true, maxlength: 120, default: '' },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // dms only
    dmKey: { type: String, unique: true, sparse: true },   // dms only: "idA:idB", prevents duplicate chats
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Conversation', conversationSchema);