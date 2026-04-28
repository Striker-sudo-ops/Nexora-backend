const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Message = require('./models/Message');
const User = require('./models/User');

(async () => {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const user = new User({ name: 'Test', email: 'test@test.com', password: 'password' });
  await user.save();

  const msg = new Message({ sender: user._id, chat: new mongoose.Types.ObjectId(), mediaUrl: 'http://example.com/img.jpg', mediaType: 'image/jpeg' });
  await msg.save();
  
  console.log('Before delete:', msg.mediaUrl, msg.mediaType);

  // simulate backend delete
  const message = await Message.findById(msg._id);
  message.isDeleted = true;
  message.content = 'This message was deleted';
  message.mediaUrl = '';
  message.mediaType = '';
  await message.save();

  const fetched = await Message.findById(msg._id);
  console.log('After delete mediaUrl:', fetched.mediaUrl);
  console.log('After delete isDeleted:', fetched.isDeleted);
  
  await mongoose.disconnect();
  await mongoServer.stop();
})();
