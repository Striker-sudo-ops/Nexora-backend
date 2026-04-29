const Chat = require('../models/Chat');
const User = require('../models/User');
const Message = require('../models/Message');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const accessChat = async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    console.log('UserId param not sent with request');
    return res.sendStatus(400);
  }

  var isChat = await Chat.find({
    isGroupChat: false,
    $and: [
      { users: { $elemMatch: { $eq: req.user._id } } },
      { users: { $elemMatch: { $eq: userId } } },
    ],
  })
    .populate('users', '-password')
    .populate('latestMessage');

  isChat = await User.populate(isChat, {
    path: 'latestMessage.sender',
    select: 'name pic email',
  });

  if (isChat.length > 0) {
    if (isChat[0].deletedBy && isChat[0].deletedBy.includes(req.user._id)) {
      await Chat.findByIdAndUpdate(isChat[0]._id, {
        $pull: { deletedBy: req.user._id },
      });
    }
    res.send(isChat[0]);
  } else {
    var chatData = {
      chatName: 'sender',
      isGroupChat: false,
      users: [req.user._id, userId],
    };

    try {
      const createdChat = await Chat.create(chatData);
      const FullChat = await Chat.findOne({ _id: createdChat._id }).populate(
        'users',
        '-password'
      );
      res.status(200).json(FullChat);
    } catch (error) {
      res.status(400);
      throw new Error(error.message);
    }
  }
};

const fetchChats = async (req, res) => {
  try {
    Chat.find({
      users: { $elemMatch: { $eq: req.user._id } },
      deletedBy: { $ne: req.user._id }
    })
      .populate('users', '-password')
      .populate('groupAdmin', '-password')
      .populate('coAdmins', '-password')
      .populate('pendingEmails.sender', 'name email')
      .populate('latestMessage')
      .sort({ updatedAt: -1 })
      .then(async (results) => {
        results = await User.populate(results, {
          path: 'latestMessage.sender',
          select: 'name pic email',
        });
        res.status(200).send(results);
      });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

const createGroupChat = async (req, res) => {
  if (!req.body.users || !req.body.name) {
    return res.status(400).send({ message: 'Please Fill all the fields' });
  }

  var users = JSON.parse(req.body.users);

  if (users.length < 2) {
    return res
      .status(400)
      .send('More than 2 users are required to form a group chat');
  }

  users.push(req.user);

  try {
    const groupChat = await Chat.create({
      chatName: req.body.name,
      users: users,
      isGroupChat: true,
      groupAdmin: req.user,
      coAdmins: [],
    });

    const fullGroupChat = await Chat.findOne({ _id: groupChat._id })
      .populate('users', '-password')
      .populate('groupAdmin', '-password')
      .populate('coAdmins', '-password');

    res.status(200).json(fullGroupChat);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

const renameGroup = async (req, res) => {
  const { chatId, chatName } = req.body;

  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat Not Found' });

    const isAdmin = chat.groupAdmin.toString() === req.user._id.toString() || (chat.coAdmins || []).includes(req.user._id);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admin can rename the group' });
    }

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { chatName: chatName },
      { new: true }
    )
      .populate('users', '-password')
      .populate('groupAdmin', '-password')
      .populate('coAdmins', '-password');

    res.json(updatedChat);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

const removeFromGroup = async (req, res) => {
  const { chatId, userId } = req.body;

  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat Not Found' });

    const isAdmin = chat.groupAdmin.toString() === req.user._id.toString() || (chat.coAdmins || []).includes(req.user._id);
    
    // Normal users can remove themselves. Admins can remove anyone EXCEPT the groupAdmin (creator).
    if (!isAdmin && req.user._id.toString() !== userId) {
      return res.status(403).json({ message: 'Only admin can remove other members' });
    }

    if (userId === chat.groupAdmin.toString() && req.user._id.toString() !== userId) {
      return res.status(403).json({ message: 'Cannot remove the original creator of the group' });
    }

    const removed = await Chat.findByIdAndUpdate(
      chatId,
      { $pull: { users: userId, coAdmins: userId } },
      { new: true }
    )
      .populate('users', '-password')
      .populate('groupAdmin', '-password')
      .populate('coAdmins', '-password');

    res.json(removed);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

const addToGroup = async (req, res) => {
  const { chatId, userId } = req.body;

  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat Not Found' });

    const isAdmin = chat.groupAdmin.toString() === req.user._id.toString() || (chat.coAdmins || []).includes(req.user._id);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admin can add members' });
    }

    const added = await Chat.findByIdAndUpdate(
      chatId,
      { $push: { users: userId } },
      { new: true }
    )
      .populate('users', '-password')
      .populate('groupAdmin', '-password')
      .populate('coAdmins', '-password');

    res.json(added);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

const updateGroupPic = async (req, res) => {
  const { chatId, pic } = req.body;

  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat Not Found' });

    const isAdmin = chat.groupAdmin.toString() === req.user._id.toString() || (chat.coAdmins || []).includes(req.user._id);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admin can change group picture' });
    }

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { groupPic: pic },
      { new: true }
    )
      .populate('users', '-password')
      .populate('groupAdmin', '-password')
      .populate('coAdmins', '-password');

    res.json(updatedChat);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

const deleteChat = async (req, res) => {
  const { chatId } = req.params;

  try {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat Not Found' });
    }

    if (!chat.deletedBy.includes(req.user._id)) {
      chat.deletedBy.push(req.user._id);
      await chat.save();
    }

    res.status(200).json({ message: 'Chat deleted successfully' });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

const sendGroupEmail = async (req, res) => {
  const { chatId, subject, message } = req.body;
  
  if (!chatId || !subject || !message) {
    return res.status(400).json({ message: 'Please provide chatId, subject, and message' });
  }

  try {
    const chat = await Chat.findById(chatId).populate('users', '-password');
    if (!chat) return res.status(404).json({ message: 'Chat Not Found' });
    if (!chat.isGroupChat) return res.status(400).json({ message: 'Not a group chat' });

    const isAdmin = chat.groupAdmin.toString() === req.user._id.toString() || (chat.coAdmins || []).includes(req.user._id);

    if (isAdmin) {
      const emails = chat.users.filter(u => u._id.toString() !== req.user._id.toString()).map(u => u.email);
      if (emails.length === 0) return res.status(200).json({ message: 'No other users in group to email' });

      const msg = {
        to: emails.join(','),
        from: process.env.EMAIL_USER,
        replyTo: req.user.email,
        subject: `[Chatify Group: ${chat.chatName}] ${subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #ec4899;">Message from Admin: ${req.user.name}</h2>
            <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #ec4899;">
              <p style="white-space: pre-wrap;">${message}</p>
            </div>
          </div>
        `
      };

      await sgMail.send(msg);

      let emailMessage = await Message.create({
        sender: req.user._id,
        content: `Email sent by ${req.user.name}`,
        chat: chatId,
      });
      emailMessage = await emailMessage.populate('sender', 'name pic');
      emailMessage = await emailMessage.populate('chat');

      return res.status(200).json({ message: 'Email sent successfully to the group', emailMessage });

    } else {
      chat.pendingEmails.push({
        sender: req.user._id,
        subject,
        message,
        status: 'pending'
      });
      await chat.save();
      
      const newEmailId = chat.pendingEmails[chat.pendingEmails.length - 1]._id;

      const adminIds = [chat.groupAdmin.toString(), ...(chat.coAdmins || []).map(id => id.toString())];
      const adminEmails = chat.users.filter(u => adminIds.includes(u._id.toString()) && u._id.toString() !== req.user._id.toString()).map(u => u.email);

      if (adminEmails.length > 0) {
        const msg = {
          to: adminEmails.join(','),
          from: process.env.EMAIL_USER,
          replyTo: req.user.email,
          subject: `[Approval Required] [Chatify Group: ${chat.chatName}] ${subject}`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
              <h2 style="color: #ec4899;">Email Approval Request from ${req.user.name}</h2>
              <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #ec4899;">
                <p style="white-space: pre-wrap;">${message}</p>
              </div>
              <p style="font-size: 16px; color: #333; font-weight: bold;">Please log in to Chatify and approve this request from the Group Info menu.</p>
            </div>
          `
        };

        await sgMail.send(msg);
      }

      let emailMessage = await Message.create({
        sender: req.user._id,
        content: `mail sent by ${req.user.name} to admins for approval`,
        chat: chatId,
      });
      emailMessage = await emailMessage.populate('sender', 'name pic');
      emailMessage = await emailMessage.populate('chat');
      emailMessage = await User.populate(emailMessage, {
        path: 'chat.users',
        select: 'name pic email',
      });
      
      return res.status(200).json({ message: 'Email request sent to admin for approval', emailMessage });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const approveGroupEmail = async (req, res) => {
  const { chatId, emailId } = req.body;

  try {
    const chat = await Chat.findById(chatId).populate('users', '-password').populate('pendingEmails.sender', 'name email');
    if (!chat) return res.status(404).json({ message: 'Chat Not Found' });
    
    const isAdmin = chat.groupAdmin.toString() === req.user._id.toString() || (chat.coAdmins || []).includes(req.user._id);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admin can approve emails' });
    }

    const emailRequest = chat.pendingEmails.id(emailId);
    if (!emailRequest || emailRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Invalid email request' });
    }

    const emails = chat.users.filter(u => u._id.toString() !== emailRequest.sender._id.toString()).map(u => u.email);
    let emailMessage = null;
    if (emails.length > 0) {
      const msg = {
        to: emails.join(','),
        from: process.env.EMAIL_USER,
        replyTo: emailRequest.sender.email,
        subject: `[Chatify Group: ${chat.chatName}] ${emailRequest.subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #ec4899;">Message from ${emailRequest.sender.name}</h2>
            <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #ec4899;">
              <p style="white-space: pre-wrap;">${emailRequest.message}</p>
            </div>
            <p style="font-size: 12px; color: #666;">Approved by Admin: ${req.user.name}</p>
          </div>
        `
      };

      await sgMail.send(msg);
      
      emailMessage = await Message.create({
        sender: req.user._id,
        content: `mail sent by ${emailRequest.sender.name}, approved by ${req.user.name}`,
        chat: chatId,
      });
      emailMessage = await emailMessage.populate('sender', 'name pic');
      emailMessage = await emailMessage.populate('chat');
      emailMessage = await User.populate(emailMessage, {
        path: 'chat.users',
        select: 'name pic email',
      });
    }

    emailRequest.status = 'approved';
    await chat.save();
    
    const updatedChat = await Chat.findById(chatId).populate('users', '-password').populate('groupAdmin', '-password').populate('coAdmins', '-password').populate('pendingEmails.sender', 'name email');
    res.status(200).json({ updatedChat, emailMessage });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const rejectGroupEmail = async (req, res) => {
  const { chatId, emailId } = req.body;

  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat Not Found' });
    
    const isAdmin = chat.groupAdmin.toString() === req.user._id.toString() || (chat.coAdmins || []).includes(req.user._id);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admin can reject emails' });
    }

    const emailRequest = chat.pendingEmails.id(emailId);
    if (!emailRequest || emailRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Invalid email request' });
    }

    emailRequest.status = 'rejected';
    await chat.save();

    const updatedChat = await Chat.findById(chatId).populate('users', '-password').populate('groupAdmin', '-password').populate('coAdmins', '-password').populate('pendingEmails.sender', 'name email');
    res.status(200).json(updatedChat);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const makeGroupAdmin = async (req, res) => {
  const { chatId, userId } = req.body;

  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat Not Found' });

    const isAdmin = chat.groupAdmin.toString() === req.user._id.toString() || (chat.coAdmins || []).includes(req.user._id);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admin can make another user admin' });
    }

    if ((chat.coAdmins || []).includes(userId) || chat.groupAdmin.toString() === userId) {
      return res.status(400).json({ message: 'User is already an admin' });
    }

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { $push: { coAdmins: userId } },
      { new: true }
    )
      .populate('users', '-password')
      .populate('groupAdmin', '-password')
      .populate('coAdmins', '-password');

    res.json(updatedChat);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const removeGroupAdmin = async (req, res) => {
  const { chatId, userId } = req.body;

  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat Not Found' });

    const isAdmin = chat.groupAdmin.toString() === req.user._id.toString() || (chat.coAdmins || []).includes(req.user._id);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admin can remove an admin' });
    }

    if (chat.groupAdmin.toString() === userId) {
      return res.status(403).json({ message: 'Cannot remove the original creator of the group' });
    }

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { $pull: { coAdmins: userId } },
      { new: true }
    )
      .populate('users', '-password')
      .populate('groupAdmin', '-password')
      .populate('coAdmins', '-password');

    res.json(updatedChat);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const clearChat = async (req, res) => {
  const { chatId } = req.body;

  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat Not Found' });

    // Update all messages in this chat to be deleted by this user
    await Message.updateMany(
      { chat: chatId, deletedBy: { $ne: req.user._id } },
      { $push: { deletedBy: req.user._id } }
    );

    res.status(200).json({ message: 'Chat cleared successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const setSelfDestructTimer = async (req, res) => {
  const { chatId, timer } = req.body;

  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat Not Found' });

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { selfDestructTimer: timer },
      { new: true }
    )
      .populate('users', '-password')
      .populate('groupAdmin', '-password')
      .populate('coAdmins', '-password');

    res.status(200).json(updatedChat);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  accessChat,
  fetchChats,
  createGroupChat,
  renameGroup,
  removeFromGroup,
  addToGroup,
  deleteChat,
  updateGroupPic,
  sendGroupEmail,
  approveGroupEmail,
  rejectGroupEmail,
  makeGroupAdmin,
  removeGroupAdmin,
  clearChat,
  setSelfDestructTimer,
};
