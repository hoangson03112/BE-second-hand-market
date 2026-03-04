const express = require("express");
const ChatController = require("../controllers/ChatController");
const verifyToken = require("../middleware/verifyToken");
const { uploadConfig, imageOrVideoFileFilter } = require("../middleware/uploadMiddleware");

const router = express.Router();

// Multer: tối đa 5 file (ảnh + video), mỗi file 50MB
const uploadChatMedia = uploadConfig.array("media", 5, {
  fileFilter: imageOrVideoFileFilter,
  maxSize: 50 * 1024 * 1024,
});

router.get("/conversations", verifyToken, ChatController.getConversationsList);
router.post(
  "/conversations/findOrCreateWithProduct",
  verifyToken,
  ChatController.findOrCreateConversationWithProduct
);
router.get(
  "/optimized/messages/:partnerId",
  verifyToken,
  ChatController.getOptimizedConversation
);
router.post("/optimized/send", verifyToken, ChatController.sendMessage);
router.post("/upload", verifyToken, uploadChatMedia, ChatController.uploadMedia);

module.exports = router;
