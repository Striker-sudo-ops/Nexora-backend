const User = require('../models/User');
const Message = require('../models/Message');
const generateToken = require('../config/generateToken');

// Generate a random 6 digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const nodemailer = require('nodemailer');

const registerUser = async (req, res) => {
  const { name, email, mobile, password, pic } = req.body;

  if (!name || !email || !mobile || !password) {
    res.status(400).json({ message: 'Please enter all fields' });
    return;
  }

  const emailExists = await User.findOne({ email });

  if (emailExists) {
    res.status(400).json({ message: 'User with this email already exists' });
    return;
  }

  const mobileCount = await User.countDocuments({ mobile });
  if (mobileCount >= 3) {
    res.status(400).json({ message: 'Maximum 3 accounts allowed per mobile number' });
    return;
  }

  const otp = generateOTP();
  const otpExpires = new Date(Date.now() + 10 * 60000); // OTP expires in 10 minutes

  // Set up NodeMailer transporter
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Welcome to Chatify - Verify Your Email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #ec4899; text-align: center;">Welcome to Chatify!</h2>
        <p style="font-size: 16px; color: #333;">Hi ${name},</p>
        <p style="font-size: 16px; color: #333;">Thank you for registering. To complete your registration, please use the following One-Time Password (OTP) to verify your email address. This OTP is valid for 10 minutes.</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #ec4899; background: #fdf2f8; padding: 10px 20px; border-radius: 8px;">${otp}</span>
        </div>
        <p style="font-size: 14px; color: #666;">If you didn't request this, please ignore this email.</p>
      </div>
    `,
  };

  try {
    // Attempt to send email
    await transporter.sendMail(mailOptions);
    
    // Only create user in DB if email successfully sends
    const user = await User.create({
      name,
      email,
      mobile,
      password,
      pic,
      otp,
      otpExpires,
    });

    if (user) {
      res.status(201).json({
        message: 'OTP sent successfully to your email',
        email: user.email,
      });
    } else {
      res.status(400).json({ message: 'Failed to create user' });
    }
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ message: 'Failed to send OTP email. Please ensure your email is valid and try again.' });
  }
};

const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res.status(400).json({ message: 'User not found' });
  }

  if (user.isVerified) {
    return res.status(400).json({ message: 'User is already verified' });
  }

  if (user.otp !== otp || user.otpExpires < Date.now()) {
    return res.status(400).json({ message: 'Invalid or expired OTP' });
  }

  // Mark user as verified and clear OTP
  user.isVerified = true;
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();

  res.status(200).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    pic: user.pic,
    token: generateToken(user._id),
  });
};

const authUser = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    if (!user.isVerified) {
      return res.status(401).json({ message: 'Please verify your account first. Request a new OTP.' });
      // Note: for a full app, you would have a "resend OTP" endpoint. 
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      pic: user.pic,
      token: generateToken(user._id),
    });
  } else {
    res.status(401).json({ message: 'Invalid Email or Password' });
  }
};

const allUsers = async (req, res) => {
  const keyword = req.query.search
    ? {
        $or: [
          { name: { $regex: req.query.search, $options: 'i' } },
          { email: { $regex: req.query.search, $options: 'i' } },
        ],
      }
    : {};

  const users = await User.find(keyword)
    .find({ _id: { $ne: req.user._id } })
    .select('-password');
  
  res.send(users);
};

const updateProfile = async (req, res) => {
  const { name, pic } = req.body;

  const user = await User.findById(req.user._id);

  if (user) {
    user.name = name || user.name;
    user.pic = pic || user.pic;

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      mobile: updatedUser.mobile,
      pic: updatedUser.pic,
      token: generateToken(updatedUser._id),
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
};

const sendEmailToUser = async (req, res) => {
  const { recipientEmail, subject, message, chatId } = req.body;

  if (!recipientEmail || !subject || !message) {
    return res.status(400).json({ message: 'Please provide recipient email, subject, and message' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: recipientEmail,
    replyTo: req.user.email,
    subject: `[Chatify] ${subject}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #ec4899; text-align: center;">New Message via Chatify</h2>
        <p style="font-size: 16px; color: #333;">You have received a new message from <strong>${req.user.name}</strong> (${req.user.email}).</p>
        <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #ec4899; border-radius: 4px;">
          <p style="font-size: 16px; color: #333; margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
        <p style="font-size: 14px; color: #666;">To reply, simply reply directly to this email or log in to Chatify.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    
    let emailMessage = null;
    if (chatId) {
      emailMessage = await Message.create({
        sender: req.user._id,
        content: `Email sent by ${req.user.name}`,
        chat: chatId,
      });
      emailMessage = await emailMessage.populate('sender', 'name pic');
      emailMessage = await emailMessage.populate('chat');
      emailMessage = await User.populate(emailMessage, {
        path: 'chat.users',
        select: 'name pic email',
      });
    }

    res.status(200).json({ message: 'Email sent successfully', emailMessage });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ message: 'Failed to send email: ' + error.message });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Please provide an email' });
  }

  const user = await User.findOne({ email });

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const otp = generateOTP();
  const otpExpires = new Date(Date.now() + 10 * 60000); // 10 minutes

  user.otp = otp;
  user.otpExpires = otpExpires;
  await user.save();

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Chatify - Password Reset OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #ec4899; text-align: center;">Reset Your Password</h2>
        <p style="font-size: 16px; color: #333;">Hi ${user.name},</p>
        <p style="font-size: 16px; color: #333;">You requested to reset your password. Use the following One-Time Password (OTP) to proceed. This OTP is valid for 10 minutes.</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #ec4899; background: #fdf2f8; padding: 10px 20px; border-radius: 8px;">${otp}</span>
        </div>
        <p style="font-size: 14px; color: #666;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Password reset OTP sent to your email' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ message: 'Failed to send OTP email. Please try again.' });
  }
};

const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ message: 'Please provide all fields' });
  }

  const user = await User.findOne({ email });

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (user.otp !== otp || user.otpExpires < Date.now()) {
    return res.status(400).json({ message: 'Invalid or expired OTP' });
  }

  user.password = newPassword;
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();

  res.status(200).json({ message: 'Password reset successfully' });
};

const deleteUser = async (req, res) => {
  try {
    const userId = req.user._id;

    // Remove user from all group chats to prevent breaking groups
    const Chat = require('../models/Chat');
    await Chat.updateMany(
      { users: userId, isGroupChat: true },
      { $pull: { users: userId, coAdmins: userId } }
    );

    // Delete the user
    await User.findByIdAndDelete(userId);

    res.status(200).json({ message: 'User account deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { registerUser, verifyOTP, authUser, allUsers, updateProfile, sendEmailToUser, forgotPassword, resetPassword, deleteUser };
