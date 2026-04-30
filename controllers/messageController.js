const Message = require('../models/Message');
const User = require('../models/User');
const Chat = require('../models/Chat');
const ScheduledMessage = require('../models/ScheduledMessage');
const cloudinary = require('cloudinary').v2;
const { GoogleGenerativeAI } = require('@google/generative-ai');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'derbhvomh',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const extractPublicId = (url) => {
  if (!url) return null;
  try {
    const splitUrl = url.split('/upload/');
    if (splitUrl.length < 2) return null;
    let path = splitUrl[1];

    if (path.match(/^v\d+\//)) {
      path = path.substring(path.indexOf('/') + 1);
    }

    const lastDotIndex = path.lastIndexOf('.');
    if (lastDotIndex !== -1) {
      path = path.substring(0, lastDotIndex);
    }

    return path;
  } catch (error) {
    console.error("Error extracting public ID:", error);
    return null;
  }
};

const sendMessage = async (req, res) => {
  const { content, chatId, mediaUrl, mediaType, replyTo } = req.body;

  if (!chatId) {
    console.log('Invalid data passed into request');
    return res.sendStatus(400);
  }

  var newMessage = {
    sender: req.user._id,
    content: content || '',
    chat: chatId,
    mediaUrl: mediaUrl || '',
    mediaType: mediaType || '',
  };

  if (replyTo) {
    newMessage.replyTo = replyTo;
  }

  try {
    // Check if chat has a self destruct timer
    const chat = await Chat.findById(chatId);
    if (chat && chat.selfDestructTimer) {
      newMessage.expiresAt = new Date(Date.now() + chat.selfDestructTimer);
    }

    var message = await Message.create(newMessage);

    message = await message.populate('sender', 'name pic');
    message = await message.populate('chat');
    if (replyTo) {
      message = await message.populate({ path: 'replyTo', select: 'content sender mediaType', populate: { path: 'sender', select: 'name' } });
    }
    message = await User.populate(message, {
      path: 'chat.users',
      select: 'name pic email',
    });

    // Update latestMessage and clear deletedBy array so it reappears for anyone who deleted it
    await Chat.findByIdAndUpdate(req.body.chatId, {
      latestMessage: message,
      $set: { deletedBy: [] } // Clear deletedBy
    });

    res.json(message);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

const allMessages = async (req, res) => {
  try {
    const messages = await Message.find({
      chat: req.params.chatId,
      deletedBy: { $ne: req.user._id }
    })
      .populate('sender', 'name pic email')
      .populate('chat')
      .populate({ path: 'replyTo', select: 'content sender mediaType', populate: { path: 'sender', select: 'name' } });
    res.json(messages);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

const editMessage = async (req, res) => {
  const { content } = req.body;
  const { messageId } = req.params;

  try {
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to edit this message' });
    }

    message.content = content;
    message.isEdited = true;
    await message.save();

    const populatedMessage = await Message.findById(messageId)
      .populate('sender', 'name pic')
      .populate('chat')
      .populate({ path: 'replyTo', select: 'content sender mediaType', populate: { path: 'sender', select: 'name' } });

    const fullyPopulatedMessage = await User.populate(populatedMessage, {
      path: 'chat.users',
      select: 'name pic email',
    });

    res.json(fullyPopulatedMessage);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

const deleteMessage = async (req, res) => {
  const { messageId } = req.params;
  const { type } = req.query; // 'me' or 'everyone'

  try {
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (type === 'me') {
      // Delete for me
      if (!message.deletedBy.includes(req.user._id)) {
        message.deletedBy.push(req.user._id);
        await message.save();
      }
    } else {
      // Delete for everyone
      if (message.sender.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to delete this message for everyone' });
      }

      if (message.mediaUrl) {
        const publicId = extractPublicId(message.mediaUrl);
        if (publicId && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
          try {
            await cloudinary.uploader.destroy(publicId);
          } catch (cloudinaryError) {
            console.error("Cloudinary deletion error:", cloudinaryError);
          }
        }
      }

      message.isDeleted = true;
      message.content = 'This message was deleted';
      message.mediaUrl = '';
      message.mediaType = '';
      await message.save();
    }

    const populatedMessage = await Message.findById(messageId)
      .populate('sender', 'name pic')
      .populate('chat')
      .populate({ path: 'replyTo', select: 'content sender mediaType', populate: { path: 'sender', select: 'name' } });

    const fullyPopulatedMessage = await User.populate(populatedMessage, {
      path: 'chat.users',
      select: 'name pic email',
    });

    res.json(fullyPopulatedMessage);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

const reactToMessage = async (req, res) => {
  const { messageId } = req.params;
  const { emoji } = req.body;
  const userId = req.user._id;

  try {
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const existingReactionIndex = message.reactions.findIndex(
      (r) => r.user.toString() === userId.toString()
    );

    if (existingReactionIndex > -1) {
      if (message.reactions[existingReactionIndex].emoji === emoji) {
        message.reactions.splice(existingReactionIndex, 1);
      } else {
        message.reactions[existingReactionIndex].emoji = emoji;
      }
    } else {
      message.reactions.push({ user: userId, emoji });
    }

    await message.save();

    const populatedMessage = await Message.findById(messageId)
      .populate('sender', 'name pic')
      .populate('chat')
      .populate({ path: 'replyTo', select: 'content sender mediaType', populate: { path: 'sender', select: 'name' } });

    const fullyPopulatedMessage = await User.populate(populatedMessage, {
      path: 'chat.users',
      select: 'name pic email',
    });

    res.json(fullyPopulatedMessage);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

const scheduleMessage = async (req, res) => {
  const { content, chatId, mediaUrl, mediaType, scheduledFor } = req.body;

  if (!chatId || !scheduledFor) {
    return res.status(400).json({ message: 'Invalid data passed into request' });
  }

  var newScheduledMessage = {
    sender: req.user._id,
    content: content || '',
    chat: chatId,
    scheduledFor: new Date(scheduledFor),
    mediaUrl: mediaUrl || '',
    mediaType: mediaType || '',
  };

  try {
    var scheduledMsg = await ScheduledMessage.create(newScheduledMessage);
    res.json(scheduledMsg);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

const summarizeMessage = async (req, res) => {
  const { messageId } = req.params;
  const { content } = req.body;

  try {
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const textToSummarize = content || message.content;

    if (!textToSummarize || textToSummarize.trim() === '') {
      return res.status(400).json({ message: 'Message has no text content to summarize' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ message: 'Server is missing GEMINI_API_KEY. Please configure it in .env' });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `Please summarize the following message into a few very concise key bullet points.\n\nMessage:\n"${textToSummarize}"`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    res.json({ summary: text });
  } catch (error) {
    console.error("Summarization error:", error);
    res.status(500).json({ message: 'Failed to summarize message. ' + error.message });
  }
};

const togglePinMessage = async (req, res) => {
  const { messageId } = req.params;

  try {
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    message.isPinned = !message.isPinned;
    await message.save();

    const populatedMessage = await Message.findById(messageId)
      .populate('sender', 'name pic')
      .populate('chat')
      .populate({ path: 'replyTo', select: 'content sender mediaType', populate: { path: 'sender', select: 'name' } });

    const fullyPopulatedMessage = await User.populate(populatedMessage, {
      path: 'chat.users',
      select: 'name pic email',
    });

    res.json(fullyPopulatedMessage);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

const generateSmartReplies = async (req, res) => {
  const { content } = req.body;
  if (!content || content.trim() === '') {
    return res.status(400).json({ message: 'No content provided for smart replies' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ message: 'Server is missing GEMINI_API_KEY. Please configure it in .env' });
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `Based on the following received message, generate 3 short, distinct, and natural-sounding quick replies (max 4-5 words each). Return ONLY a valid JSON array of strings containing the replies. Example: ["Sounds good!", "I'll check it out.", "Thanks!"]\n\nMessage:\n"${content}"`;

    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();

    // Attempt to parse JSON safely
    if (text.startsWith('\`\`\`json')) {
      text = text.substring(7, text.length - 3);
    } else if (text.startsWith('\`\`\`')) {
      text = text.substring(3, text.length - 3);
    }

    const replies = JSON.parse(text);

    if (Array.isArray(replies)) {
      res.json({ replies: replies.slice(0, 3) });
    } else {
      throw new Error("Invalid format returned by AI");
    }
  } catch (error) {
    console.error("Smart Replies error:", error);
    res.status(500).json({ message: 'Failed to generate smart replies. ' + error.message });
  }
};

module.exports = { allMessages, sendMessage, editMessage, deleteMessage, reactToMessage, scheduleMessage, summarizeMessage, togglePinMessage, generateSmartReplies };
