const express = require("express");
const router = express.Router();
const RefundController = require("../controllers/RefundController");
const verifyToken = require("../middleware/verifyToken");
const verifyAdmin = require("../middleware/verifyAdmin");
const { asyncHandler } = require("../shared/errors/errorHandler");
const {
  uploadConfig,
  createUpload,
  imageOrVideoFileFilter,
} = require("../middleware/uploadMiddleware");
const {
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
} = require("../shared/middleware/cache.middleware.functional");

// Upload middleware cho evidence (images + videos)
const refundEvidenceUpload = createUpload({
  fileFilter: imageOrVideoFileFilter,
  maxSize: 50 * 1024 * 1024, // 50MB
}).fields([
  { name: "images", maxCount: 10 },
  { name: "videos", maxCount: 3 },
]);

// ==================== BUYER ROUTES ====================

// Tạo yêu cầu hoàn tiền (với upload evidence)
router.post(
  "/",
  verifyToken,
  refundEvidenceUpload,
  createCacheInvalidationMiddleware("refund*"),
  asyncHandler(RefundController.createRefund)
);

// Lấy danh sách refund của buyer
router.get(
  "/buyer/my",
  verifyToken,
  createCacheMiddleware({ ttl: 300, keyPrefix: "refund-buyer" }),
  asyncHandler(RefundController.getMyRefunds)
);

// Escalate to admin
router.post(
  "/:refundId/escalate",
  verifyToken,
  createCacheInvalidationMiddleware("refund*"),
  asyncHandler(RefundController.escalateToAdmin)
);

// ==================== SELLER ROUTES ====================

// Lấy danh sách refund cần xử lý
router.get(
  "/seller/pending",
  verifyToken,
  createCacheMiddleware({ ttl: 300, keyPrefix: "refund-seller" }),
  asyncHandler(RefundController.getSellerRefunds)
);

// Seller phản hồi (approve/reject)
router.put(
  "/:refundId/respond",
  verifyToken,
  createCacheInvalidationMiddleware("refund*"),
  asyncHandler(RefundController.respondToRefund)
);

// Đánh dấu đã hoàn tiền xong
router.put(
  "/:refundId/complete",
  verifyToken,
  createCacheInvalidationMiddleware("refund*"),
  asyncHandler(RefundController.completeRefund)
);

// ==================== ADMIN ROUTES ====================

// Admin: Lấy tất cả refunds
router.get(
  "/admin/all",
  verifyToken,
  verifyAdmin,
  createCacheMiddleware({ ttl: 180, keyPrefix: "refund-admin" }),
  asyncHandler(RefundController.getAllRefundsAdmin)
);

// Admin xử lý dispute
router.put(
  "/:refundId/admin-handle",
  verifyToken,
  verifyAdmin,
  createCacheInvalidationMiddleware("refund*"),
  asyncHandler(RefundController.adminHandleRefund)
);

// ==================== COMMON ROUTES ====================

// Xem chi tiết 1 refund (buyer/seller/admin)
router.get(
  "/:refundId",
  verifyToken,
  createCacheMiddleware({ ttl: 300, keyPrefix: "refund-detail" }),
  asyncHandler(RefundController.getRefundById)
);

module.exports = router;
