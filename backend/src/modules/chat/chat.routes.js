const express = require("express");
const ChatController = require("./chat.controller");
const verifyToken = require("../../middlewares/verifyToken");
const { uploadConfig, imageOrVideoFileFilter } = require("../../middlewares/upload");

const router = express.Router();

// Multer: tá»‘i Ä‘a 5 file (áº£nh + video), má»—i file 50MB
const uploadChatMedia = uploadConfig.array("media", 5, {
  fileFilter: imageOrVideoFileFilter,
  maxSize: 50 * 1024 * 1024,
});

router.get("/conversations", verifyToken, ChatController.getConversationsList);
router.post("/ai/search-products", verifyToken, ChatController.searchProductsByAI);
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
router.post(
  "/conversations/:conversationId/mark-read",
  verifyToken,
  ChatController.markConversationAsRead
);
router.delete("/messages/:messageId", verifyToken, ChatController.deleteMessage);

module.exports = router;

