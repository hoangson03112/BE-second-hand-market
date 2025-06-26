const express = require("express");
const AdminController = require("../controllers/AdminController");
const verifyToken = require("../middleware/verifyToken");
// const verifyAdmin = require("../middleware/verifyAdmin"); // Bạn cần tạo middleware này

const router = express.Router();

// Routes cho AI moderation management
router.get("/products/pending-review", verifyToken, AdminController.getPendingReviewProducts);
router.patch("/products/:productId/review", verifyToken, AdminController.reviewProduct);
router.get("/products/:productId/details", verifyToken, AdminController.getProductWithAIResult);
router.get("/moderation/stats", verifyToken, AdminController.getModerationStats);

module.exports = router; 