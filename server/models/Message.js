const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
      required: [
        function () {
          return !this.deleted && !this.attachment?.url;
        },
        'Message is empty',
      ],
    },
    attachment: {
      url: { type: String, default: null },
      publicId: { type: String, default: null },
      fileName: { type: String, default: null },
      fileType: { type: String, default: null },
      size: { type: Number, default: null },
    },
    edited: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    hiddenFor: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [], select: false },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    reactions: {
      type: [new mongoose.Schema(
        { user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, key: String },
        { _id: false }
      )],
      default: [],
    },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
