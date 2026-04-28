const express = require('express');
const { registerUser, verifyOTP, authUser, allUsers, updateProfile, sendEmailToUser, forgotPassword, resetPassword, deleteUser } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/').get(protect, allUsers);
router.route('/profile').put(protect, updateProfile);
router.delete('/delete', protect, deleteUser);
router.post('/register', registerUser);
router.post('/verify', verifyOTP);
router.post('/login', authUser);
router.post('/send-email', protect, sendEmailToUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
