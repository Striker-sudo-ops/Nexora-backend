const mongoose = require('mongoose');

const chatModel = mongoose.Schema(
  {
    chatName: { type: String, trim: true },
    isGroupChat: { type: Boolean, default: false },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    latestMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    groupAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    coAdmins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    groupPic: { type: String, default: '' },
    deletedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    pendingEmails: [{
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      subject: String,
      message: String,
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      createdAt: { type: Date, default: Date.now }
    }],
    selfDestructTimer: { type: Number, default: null }, // Duration in milliseconds
  },
  { timestamps: true }
);

const Chat = mongoose.model('Chat', chatModel);
module.exports = Chat;
