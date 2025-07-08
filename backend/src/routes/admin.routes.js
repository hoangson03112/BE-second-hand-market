const express = require("express");
const AdminController = require("../controllers/AdminController");
const verifyToken = require("../middleware/verifyToken");
const verifyAdmin = require("../middleware/verifyAdmin"); // Bạn cần tạo middleware này
const { getModerationSystemHealth, testAPIKeys } = require("../services/aiModeration.service");

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

// ⭐ NEW: ADMIN MODERATION CONTROLS
router.put("/admin/moderation/toggle-mode", verifyToken, verifyAdmin, AdminController.toggleModerationMode);
router.post("/admin/moderation/reprocess/:productId", verifyToken, verifyAdmin, AdminController.reprocessProduct);
router.get("/admin/moderation/health", verifyToken, verifyAdmin, AdminController.getModerationHealth);

module.exports = router; 