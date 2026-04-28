const express = require('express');
const { allMessages, sendMessage, editMessage, deleteMessage, reactToMessage, scheduleMessage, summarizeMessage, togglePinMessage, generateSmartReplies } = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/:chatId').get(protect, allMessages);
router.route('/').post(protect, sendMessage);
router.route('/schedule').post(protect, scheduleMessage);
router.route('/:messageId').put(protect, editMessage);
router.route('/:messageId').delete(protect, deleteMessage);
router.route('/:messageId/react').put(protect, reactToMessage);
router.route('/:messageId/pin').put(protect, togglePinMessage);
router.route('/:messageId/summarize').post(protect, summarizeMessage);
router.route('/smart-replies').post(protect, generateSmartReplies);

module.exports = router;
