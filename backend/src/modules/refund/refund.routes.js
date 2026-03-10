const express = require("express");
const router = express.Router();
const RefundController = require("./refund.controller");
const verifyToken = require("../../middlewares/verifyToken");
const verifyAdmin = require("../../middlewares/verifyAdmin");
const { asyncHandler } = require("../../middlewares/errorHandler");
const {
  uploadConfig,
  createUpload,
  imageOrVideoFileFilter,
} = require("../../middlewares/upload");
const {
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
} = require("../../middlewares/cache");

// Upload middleware cho evidence (images + videos)
const refundEvidenceUpload = createUpload({
  fileFilter: imageOrVideoFileFilter,
  maxSize: 50 * 1024 * 1024, // 50MB
}).fields([
  { name: "images", maxCount: 10 },
  { name: "videos", maxCount: 3 },
]);

// ==================== BUYER ROUTES ====================

// Táº¡o yÃªu cáº§u hoÃ n tiá»n (vá»›i upload evidence)
router.post(
  "/",
  verifyToken,
  refundEvidenceUpload,
  createCacheInvalidationMiddleware("refund*"),
  asyncHandler(RefundController.createRefund)
);

// Láº¥y danh sÃ¡ch refund cá»§a buyer
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

// Láº¥y danh sÃ¡ch refund cáº§n xá»­ lÃ½
router.get(
  "/seller/pending",
  verifyToken,
  createCacheMiddleware({ ttl: 300, keyPrefix: "refund-seller" }),
  asyncHandler(RefundController.getSellerRefunds)
);

// Seller pháº£n há»“i (approve/reject)
router.put(
  "/:refundId/respond",
  verifyToken,
  createCacheInvalidationMiddleware("refund*"),
  asyncHandler(RefundController.respondToRefund)
);

// ÄÃ¡nh dáº¥u Ä‘Ã£ hoÃ n tiá»n xong
router.put(
  "/:refundId/complete",
  verifyToken,
  createCacheInvalidationMiddleware("refund*"),
  asyncHandler(RefundController.completeRefund)
);

// ==================== ADMIN ROUTES ====================

// Admin: Láº¥y táº¥t cáº£ refunds
router.get(
  "/admin/all",
  verifyToken,
  verifyAdmin,
  createCacheMiddleware({ ttl: 180, keyPrefix: "refund-admin" }),
  asyncHandler(RefundController.getAllRefundsAdmin)
);

// Admin xá»­ lÃ½ dispute
router.put(
  "/:refundId/admin-handle",
  verifyToken,
  verifyAdmin,
  createCacheInvalidationMiddleware("refund*"),
  asyncHandler(RefundController.adminHandleRefund)
);

// ==================== COMMON ROUTES ====================

// Xem chi tiáº¿t 1 refund (buyer/seller/admin)
router.get(
  "/:refundId",
  verifyToken,
  createCacheMiddleware({ ttl: 300, keyPrefix: "refund-detail" }),
  asyncHandler(RefundController.getRefundById)
);

module.exports = router;

