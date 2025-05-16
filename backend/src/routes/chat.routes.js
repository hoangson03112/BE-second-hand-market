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

// Conversations routes
router.get("/conversations", verifyToken, ChatController.getConversationsList);
router.post(
  "/conversations/findOrCreateWithProduct",
  verifyToken,
  ChatController.findOrCreateConversationWithProduct
);
router.post(
  "/conversations/findOrCreateWithOrder",
  verifyToken,
  ChatController.findOrCreateConversationWithOrder
);
router.get(
  "/optimized/messages/:partnerId",
  verifyToken,
  ChatController.getOptimizedConversation
);
router.post("/optimized/send", verifyToken, ChatController.sendMessage);

// File attachment routes
router.post(
  "/upload-and-send",
  verifyToken,
  upload.array("files"),
  ChatController.uploadAndSendMessage
);

module.exports = router;
