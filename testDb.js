const mongoose = require('mongoose');
const Message = require('./models/Message');

(async () => {
  try {
    await mongoose.connect('mongodb://priyanshusingh0709004_db_user:5HhCMwJOcrAhpOZX@ac-vf8sm5c-shard-00-00.g9mfq4m.mongodb.net:27017,ac-vf8sm5c-shard-00-01.g9mfq4m.mongodb.net:27017,ac-vf8sm5c-shard-00-02.g9mfq4m.mongodb.net:27017/?ssl=true&replicaSet=atlas-n5fm7b-shard-0&authSource=admin&appName=Cluster0');
    console.log('Connected to DB');

    const msg = new Message({ sender: new mongoose.Types.ObjectId(), chat: new mongoose.Types.ObjectId(), mediaUrl: 'http://example.com/img.jpg', mediaType: 'image/jpeg' });
    await msg.save();
    
    console.log('Before delete mediaUrl:', msg.mediaUrl);
    
    msg.isDeleted = true;
    msg.content = 'This message was deleted';
    msg.mediaUrl = '';
    msg.mediaType = '';
    await msg.save();
    
    const fetched = await Message.findById(msg._id);
    console.log('After delete mediaUrl:', fetched.mediaUrl);
    console.log('After delete isDeleted:', fetched.isDeleted);
    
  } catch (error) {
    console.error(error);
  } finally {
    mongoose.disconnect();
  }
})();
