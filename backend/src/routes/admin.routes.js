const express = require("express");
const AdminController = require("../controllers/AdminController");
const verifyToken = require("../middleware/verifyToken");
const { getModerationSystemHealth, testAPIKeys } = require("../services/aiModeration.service");
// const verifyAdmin = require("../middleware/verifyAdmin"); // Bạn cần tạo middleware này

const router = express.Router();

// Routes cho AI moderation management
router.get("/products/pending-review", verifyToken, AdminController.getPendingReviewProducts);
router.patch("/products/:productId/review", verifyToken, AdminController.reviewProduct);
router.get("/products/:productId/details", verifyToken, AdminController.getProductWithAIResult);
router.get("/moderation/stats", verifyToken, AdminController.getModerationStats);

// Health check endpoints
router.get("/moderation/health", verifyToken, async (req, res) => {
  try {
    const health = getModerationSystemHealth();
    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get moderation health",
      error: error.message
    });
  }
});

router.post("/moderation/test-apis", verifyToken, async (req, res) => {
  try {
    const testResults = await testAPIKeys();
    res.json({
      success: true,
      data: testResults,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to test APIs",
      error: error.message
    });
  }
});

module.exports = router; 