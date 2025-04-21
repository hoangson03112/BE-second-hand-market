const express = require("express");
const ChatController = require("../controllers/ChatController");
const verifyToken = require("../middleware/verifyToken");
const multer = require("multer");

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // Limit file size to 20MB
  },
});

// All chat routes require authentication
router.get("/messages/:partnerId", verifyToken, ChatController.getConversation);
router.get("/partners", verifyToken, ChatController.getChatPartners);
router.get("/history", verifyToken, ChatController.getChatHistory);

// Send a file message
router.post("/send-file", verifyToken, ChatController.sendFileMessage);

// Upload files to Cloudinary and send message with attachments
router.post(
  "/upload-and-send",
  verifyToken,
  upload.array("files"),
  ChatController.uploadAndSendMessage
);

module.exports = router;
