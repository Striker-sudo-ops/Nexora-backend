const mongoose = require('mongoose');

const scheduledMessageSchema = mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: { type: String, trim: true },
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' },
    scheduledFor: { type: Date, required: true },
    mediaUrl: { type: String },
    mediaType: { type: String },
  },
  { timestamps: true }
);

const ScheduledMessage = mongoose.model('ScheduledMessage', scheduledMessageSchema);
module.exports = ScheduledMessage;
