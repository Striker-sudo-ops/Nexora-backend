const mongoose = require('mongoose');

const messageSchema = mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: { type: String, trim: true },
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' },
    isEdited: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    mediaUrl: { type: String },
    mediaType: { type: String },
    reactions: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      emoji: { type: String }
    }],
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    isPinned: { type: Boolean, default: false },
    expiresAt: { type: Date }
  },
  { timestamps: true }
);

const Message = mongoose.model('Message', messageSchema);
module.exports = Message;
