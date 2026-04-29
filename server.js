const express = require('express');
const dotenv = require('dotenv');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dotenv.config({ override: true });

const cors = require('cors');
const connectDB = require('./config/db');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');

const app = express();
app.use(cors({
  origin: "https://nexora-frontend-five.vercel.app",
  credentials: true
}));
app.use(express.json()); // to accept JSON data
app.set("trust proxy", 1);
// Routes
app.use('/api/user', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/message', messageRoutes);

app.get('/', (req, res) => {
  res.send('API is running successfully');
});

const PORT = process.env.PORT || 5000;

connectDB();

const server = app.listen(PORT, console.log(`Server running on PORT ${PORT}`));

// Socket.io Setup
const io = require('socket.io')(server, {
  pingTimeout: 60000,
  cors: {
    origin: 'https://nexora-frontend-five.vercel.app',                   // Vite default port
    credentials: true, 
  },
});

io.on('connection', (socket) => {
  console.log('Connected to socket.io');

  socket.on('setup', (userData) => {
    socket.join(userData._id);
    socket.emit('connected');
  });

  socket.on('join chat', (room) => {
    socket.join(room);
    console.log('User Joined Room: ' + room);
  });

  socket.on('new message', (newMessageRecieved) => {
    var chat = newMessageRecieved.chat;

    if (!chat.users) return console.log('chat.users not defined');

    chat.users.forEach((user) => {
      if (user._id == newMessageRecieved.sender._id) return;
      socket.in(user._id).emit('message recieved', newMessageRecieved);
    });
  });

  socket.on('typing', (room) => socket.in(room).emit('typing'));
  socket.on('stop typing', (room) => socket.in(room).emit('stop typing'));

  socket.on('message edited', (updatedMessage) => {
    var chat = updatedMessage.chat;
    if (!chat.users) return console.log('chat.users not defined');

    chat.users.forEach((user) => {
      if (user._id == updatedMessage.sender._id) return;
      socket.in(user._id).emit('message edited', updatedMessage);
    });
  });

  socket.on('message deleted', (deletedMessage) => {
    var chat = deletedMessage.chat;
    if (!chat.users) return console.log('chat.users not defined');

    chat.users.forEach((user) => {
      if (user._id == deletedMessage.sender._id) return;
      socket.in(user._id).emit('message deleted', deletedMessage);
    });
  });

  socket.on('message pinned', (pinnedMessage) => {
    var chat = pinnedMessage.chat;
    if (!chat.users) return console.log('chat.users not defined');

    chat.users.forEach((user) => {
      if (user._id == pinnedMessage.sender._id) return;
      socket.in(user._id).emit('message pinned', pinnedMessage);
    });
  });

  socket.on('message reacted', (reactedMessage) => {
    var chat = reactedMessage.chat;
    if (!chat.users) return console.log('chat.users not defined');

    chat.users.forEach((user) => {
      if (user._id == reactedMessage.sender._id) return;
      socket.in(user._id).emit('message reacted', reactedMessage);
    });
  });

  socket.off('setup', () => {
    console.log('USER DISCONNECTED');
    
  });
});

// Background Tasks for Scheduled and Self-Destructing Messages
const Message = require('./models/Message');
const ScheduledMessage = require('./models/ScheduledMessage');
const User = require('./models/User');
const Chat = require('./models/Chat');

setInterval(async () => {
  try {
    const now = new Date();

    // 1. Send Scheduled Messages
    const dueMessages = await ScheduledMessage.find({ scheduledFor: { $lte: now } });
    if (dueMessages.length > 0) {
      for (const sMsg of dueMessages) {
        // Delete immediately to prevent duplicate processing if intervals overlap
        await ScheduledMessage.findByIdAndDelete(sMsg._id);

        let newMsg = await Message.create({
          sender: sMsg.sender,
          content: sMsg.content,
          chat: sMsg.chat,
          mediaUrl: sMsg.mediaUrl,
          mediaType: sMsg.mediaType,
        });

        // Check if chat has self destruct timer to apply it to the new message
        const chat = await Chat.findById(sMsg.chat);
        if (chat && chat.selfDestructTimer) {
          newMsg.expiresAt = new Date(Date.now() + chat.selfDestructTimer);
          await newMsg.save();
        }

        newMsg = await newMsg.populate('sender', 'name pic');
        newMsg = await newMsg.populate('chat');
        newMsg = await User.populate(newMsg, {
          path: 'chat.users',
          select: 'name pic email',
        });

        await Chat.findByIdAndUpdate(sMsg.chat, { 
          latestMessage: newMsg,
          $set: { deletedBy: [] }
        });

        if (chat && chat.users) {
          chat.users.forEach((userId) => {
            io.in(userId.toString()).emit('message recieved', newMsg);
          });
        }
      }
    }

    // 2. Delete Expired Messages
    const expiredMessages = await Message.find({ expiresAt: { $lte: now }, isDeleted: false });
    if (expiredMessages.length > 0) {
      for (const msg of expiredMessages) {
        msg.isDeleted = true;
        msg.content = 'This message was deleted (Self-Destruct)';
        msg.mediaUrl = '';
        msg.mediaType = '';
        await msg.save();

        const popMsg = await Message.findById(msg._id).populate('sender', 'name pic').populate('chat');
        const fullMsg = await User.populate(popMsg, { path: 'chat.users', select: 'name pic email' });

        if (fullMsg.chat && fullMsg.chat.users) {
          fullMsg.chat.users.forEach((user) => {
            io.in(user._id.toString()).emit('message deleted', fullMsg);
          });
        }
      }
    }

  } catch (error) {
    console.error("Background task error:", error);
  }
}, 10000); // Check every 10 seconds
