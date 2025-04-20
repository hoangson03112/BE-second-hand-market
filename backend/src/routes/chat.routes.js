const express = require('express');
const ChatController = require('../controllers/ChatController');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

// All chat routes require authentication
router.get('/messages/:partnerId', verifyToken, ChatController.getConversation);
router.get('/partners', verifyToken, ChatController.getChatPartners);
router.get('/history', verifyToken, ChatController.getChatHistory);

module.exports = router; 