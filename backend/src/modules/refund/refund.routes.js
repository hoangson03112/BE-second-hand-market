const express = require("express");
const { safeRouter } = require("../../utils/safeRouter");
const router = safeRouter();
const RefundController = require("./refund.controller");
const verifyToken = require("../../middlewares/verifyToken");
const verifyAdmin = require("../../middlewares/verifyAdmin");
const { asyncHandler } = require("../../middlewares/errorHandler");
const {
  uploadConfig,
  createUpload,
  imageOrVideoFileFilter
} = require("../../middlewares/upload");
const {
  createCacheMiddleware,
  createCacheInvalidationMiddleware
} = require("../../middlewares/cache");


const refundEvidenceUpload = createUpload({
  fileFilter: imageOrVideoFileFilter,
  maxSize: 50 * 1024 * 1024
}).fields([
{ name: "images", maxCount: 10 },
{ name: "videos", maxCount: 3 }]
);




router.post(
  "/",
  verifyToken,
  refundEvidenceUpload,
  createCacheInvalidationMiddleware("refund*"),
  asyncHandler(RefundController.createRefund)
);


router.get(
  "/buyer/my",
  verifyToken,
  createCacheMiddleware({ ttl: 300, keyPrefix: "refund-buyer" }),
  asyncHandler(RefundController.getMyRefunds)
);


router.post(
  "/:refundId/escalate",
  verifyToken,
  createCacheInvalidationMiddleware("refund*"),
  asyncHandler(RefundController.escalateToAdmin)
);




router.get(
  "/seller/pending",
  verifyToken,
  createCacheMiddleware({ ttl: 300, keyPrefix: "refund-seller" }),
  asyncHandler(RefundController.getSellerRefunds)
);


router.put(
  "/:refundId/respond",
  verifyToken,
  createCacheInvalidationMiddleware("refund*"),
  asyncHandler(RefundController.respondToRefund)
);


router.put(
  "/:refundId/complete",
  verifyToken,
  createCacheInvalidationMiddleware("refund*"),
  asyncHandler(RefundController.completeRefund)
);




router.get(
  "/admin/all",
  verifyToken,
  verifyAdmin,
  createCacheMiddleware({ ttl: 180, keyPrefix: "refund-admin" }),
  asyncHandler(RefundController.getAllRefundsAdmin)
);


router.put(
  "/:refundId/admin-handle",
  verifyToken,
  verifyAdmin,
  createCacheInvalidationMiddleware("refund*"),
  asyncHandler(RefundController.adminHandleRefund)
);




router.get(
  "/:refundId",
  verifyToken,
  createCacheMiddleware({ ttl: 300, keyPrefix: "refund-detail" }),
  asyncHandler(RefundController.getRefundById)
);

module.exports = router;