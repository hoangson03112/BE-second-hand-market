"use strict";

const express      = require("express");
const c            = require("./order.controller");
const verifyToken  = require("../../middlewares/verifyToken");
const verifyAdmin  = require("../../middlewares/verifyAdmin");
const { asyncHandler } = require("../../middlewares/errorHandler");
const {
  cacheByUser,
  createCacheInvalidationMiddleware,
} = require("../../middlewares/cache");
const {
  createUpload,
  imageOrVideoFileFilter,
} = require("../../middlewares/upload");

const refundEvidenceUpload = createUpload({
  fileFilter: imageOrVideoFileFilter,
  maxSize: 50 * 1024 * 1024,
}).fields([
  { name: "images", maxCount: 10 },
  { name: "videos", maxCount: 3 },
]);

const router = express.Router();

const invalidateOrders = createCacheInvalidationMiddleware("order*");

// ─── GHN webhook (no auth — callback from GHN servers) ───────────────────────
router.post("/ghn/webhook", asyncHandler(c.handleGHNWebhook.bind(c)));

// ─── Buyer ────────────────────────────────────────────────────────────────────
router.post(
  "/",
  verifyToken,
  invalidateOrders,
  createCacheInvalidationMiddleware("cart*"),
  asyncHandler(c.createOrder.bind(c)),
);

router.get(
  "/my-orders",
  verifyToken,
  cacheByUser({ ttl: 120, keyPrefix: "orders" }),
  asyncHandler(c.getMyOrders.bind(c)),
);

router.get(
  "/order-details/:id",
  verifyToken,
  cacheByUser({ ttl: 300, keyPrefix: "order-detail" }),
  asyncHandler(c.getOrderById.bind(c)),
);

router.post(
  "/:id/cancel",
  verifyToken,
  invalidateOrders,
  asyncHandler(c.cancelOrder.bind(c)),
);

router.patch(
  "/:id/confirm-received",
  verifyToken,
  invalidateOrders,
  asyncHandler(c.buyerConfirmReceived.bind(c)),
);

router.post(
  "/:id/request-refund",
  verifyToken,
  refundEvidenceUpload,
  invalidateOrders,
  asyncHandler(c.requestRefund.bind(c)),
);

// ─── Seller ───────────────────────────────────────────────────────────────────
router.get(
  "/seller/my",
  verifyToken,
  asyncHandler(c.getSellerOrders.bind(c)),
);

router.patch(
  "/seller/update/:orderId",
  verifyToken,
  invalidateOrders,
  asyncHandler(c.sellerUpdateOrder.bind(c)),
);

router.get(
  "/seller/payouts",
  verifyToken,
  asyncHandler(c.getSellerPayouts.bind(c)),
);

router.get(
  "/seller/wallet",
  verifyToken,
  asyncHandler(c.getSellerWallet.bind(c)),
);

router.get(
  "/:id/tracking",
  verifyToken,
  asyncHandler(c.getOrderTracking.bind(c)),
);

router.get(
  "/:orderId/seller-bank-info",
  verifyToken,
  asyncHandler(c.getSellerBankInfo.bind(c)),
);

router.post(
  "/:id/approve-refund",
  verifyToken,
  invalidateOrders,
  asyncHandler(c.approveRefund.bind(c)),
);

router.post(
  "/:id/reject-refund",
  verifyToken,
  invalidateOrders,
  asyncHandler(c.rejectRefund.bind(c)),
);

router.post(
  "/:id/confirm-return-received",
  verifyToken,
  invalidateOrders,
  asyncHandler(c.confirmReturnReceived.bind(c)),
);

router.post(
  "/:id/refund-bank-info",
  verifyToken,
  invalidateOrders,
  asyncHandler(c.submitRefundBankInfo.bind(c)),
);

// ─── Admin ────────────────────────────────────────────────────────────────────
router.get(
  "/admin/all",
  verifyToken,
  verifyAdmin,
  asyncHandler(c.getAdminOrders.bind(c)),
);

router.patch(
  "/admin/update-status/:id",
  verifyToken,
  verifyAdmin,
  invalidateOrders,
  asyncHandler(c.updateOrderStatus.bind(c)),
);

router.post(
  "/:id/confirm-bank-transfer",
  verifyToken,
  verifyAdmin,
  invalidateOrders,
  asyncHandler(c.confirmBankTransfer.bind(c)),
);

router.post(
  "/:id/confirm-cod-payment",
  verifyToken,
  verifyAdmin,
  invalidateOrders,
  asyncHandler(c.confirmCodPayment.bind(c)),
);

router.post(
  "/:id/complete-refund",
  verifyToken,
  verifyAdmin,
  invalidateOrders,
  asyncHandler(c.completeRefund.bind(c)),
);

router.post(
  "/:id/payout",
  verifyToken,
  verifyAdmin,
  asyncHandler(c.triggerPayout.bind(c)),
);

router.get(
  "/admin/pending-payouts",
  verifyToken,
  verifyAdmin,
  asyncHandler(c.getAdminPendingPayouts.bind(c)),
);

module.exports = router;