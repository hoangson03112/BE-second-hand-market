const express = require("express");
const AdminController = require("../controllers/AdminController");
const verifyToken = require("../middleware/verifyToken");
const verifyAdmin = require("../middleware/verifyAdmin");
const { getModerationSystemHealth, testAPIKeys } = require("../services/aiModeration.service");
const { getDashboardStats } = require("../controllers/dashboardController");
const {
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
} = require("../shared/middleware/cache.middleware.functional");

const router = express.Router();
router.get(
  "/dashboard",
  createCacheMiddleware({ ttl: 120, keyPrefix: 'dashboard' }),
  getDashboardStats
);

// Routes cho AI moderation management
router.get(
  "/products/pending-review",
  verifyToken,
  createCacheMiddleware({ ttl: 60, keyPrefix: 'admin-pending' }),
  AdminController.getPendingReviewProducts
);
router.patch(
  "/products/:productId/review",
  verifyToken,
  createCacheInvalidationMiddleware('admin*'),
  createCacheInvalidationMiddleware('products*'),
  AdminController.reviewProduct
);
router.get("/products/:productId/details", verifyToken, AdminController.getProductWithAIResult);
router.get(
  "/moderation/stats",
  verifyToken,
  createCacheMiddleware({ ttl: 120, keyPrefix: 'admin-stats' }),
  AdminController.getModerationStats
);

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
router.put(
  "/admin/moderation/toggle-mode",
  verifyToken,
  verifyAdmin,
  createCacheInvalidationMiddleware('admin*'),
  AdminController.toggleModerationMode
);
router.post(
  "/admin/moderation/reprocess/:productId",
  verifyToken,
  verifyAdmin,
  createCacheInvalidationMiddleware('admin*'),
  createCacheInvalidationMiddleware('products*'),
  AdminController.reprocessProduct
);
router.get("/admin/moderation/health", verifyToken, verifyAdmin, AdminController.getModerationHealth);

module.exports = router; 