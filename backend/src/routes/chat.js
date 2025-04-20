const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewave/verifyToken");
const ChatController = require("../controllers/ChatController");

// Lấy tất cả tin nhắn
router.get("/messages/:partnerId", verifyToken, ChatController.getConversation);

// Lấy danh sách người chat
router.get("/partners", verifyToken, ChatController.getChatPartners);

// Lấy lịch sử chat
router.get("/history", verifyToken, ChatController.getChatHistory);

module.exports = router;
