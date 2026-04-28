const express = require('express');
const {
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
  setSelfDestructTimer
} = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/').post(protect, accessChat);
router.route('/').get(protect, fetchChats);
router.route('/clear').put(protect, clearChat);
router.route('/selfdestruct').put(protect, setSelfDestructTimer);
router.route('/group').post(protect, createGroupChat);
router.route('/grouprename').put(protect, renameGroup);
router.route('/groupremove').put(protect, removeFromGroup);
router.route('/groupadd').put(protect, addToGroup);
router.route('/grouppic').put(protect, updateGroupPic);
router.route('/:chatId').delete(protect, deleteChat);
router.route('/groupemail').post(protect, sendGroupEmail);
router.route('/groupemail/approve').put(protect, approveGroupEmail);
router.route('/groupemail/reject').put(protect, rejectGroupEmail);
router.route('/groupadmin/make').put(protect, makeGroupAdmin);
router.route('/groupadmin/remove').put(protect, removeGroupAdmin);

module.exports = router;
