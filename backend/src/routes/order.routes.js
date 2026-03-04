const express = require("express");
const OrderController = require("../controllers/OrderController");
const verifyToken = require("../middleware/verifyToken");
const { asyncHandler } = require("../shared/errors/errorHandler");
const {
  cacheByUser,
  createCacheInvalidationMiddleware,
} = require("../shared/middleware/cache.middleware.functional");

const router = express.Router();

router.post(
  "/",
  verifyToken,
  createCacheInvalidationMiddleware('order*'),
  createCacheInvalidationMiddleware('cart*'),
  asyncHandler(OrderController.createOrder)
);
router.get(
  "/my-orders",
  verifyToken,
  cacheByUser({ ttl: 120, keyPrefix: 'orders' }),
  asyncHandler(OrderController.getOrderByAccount)
);
router.get(
  "/seller/my",
  verifyToken,
  asyncHandler(OrderController.getOrdersOfSeller)
);
router.patch(
  "/seller/update/:orderId",
  verifyToken,
  createCacheInvalidationMiddleware('order*'),
  asyncHandler(OrderController.updateOrderBySeller)
);
router.patch(
  "/update-payment-status",
  verifyToken,
  createCacheInvalidationMiddleware('order*'),
  asyncHandler(OrderController.updatePaymentStatus)
);
router.get(
  "/admin/all",
  verifyToken,
  asyncHandler(OrderController.getOrdersByAdmin)
);
router.patch(
  "/update",
  verifyToken,
  createCacheInvalidationMiddleware('order*'),
  asyncHandler(OrderController.updateOrder)
);
router.get(
  "/order-details/:id",
  verifyToken,
  cacheByUser({ ttl: 300, keyPrefix: 'order-detail' }),
  asyncHandler(OrderController.getOrderById)
);
router.get(
  "/:orderId/seller-bank-info",
  verifyToken,
  asyncHandler(OrderController.getSellerBankInfoForOrder)
);
router.patch(
  "/:orderId/confirm-received",
  verifyToken,
  createCacheInvalidationMiddleware('order*'),
  asyncHandler(OrderController.buyerConfirmReceived)
);
router.patch(
  "/:orderId/request-refund",
  verifyToken,
  createCacheInvalidationMiddleware('order*'),
  asyncHandler(OrderController.requestRefund)
);

// GHN webhook - không cần verifyToken vì đây là callback từ GHN
router.post(
  "/ghn/webhook",
  asyncHandler(OrderController.handleGHNWebhook)
);

module.exports = router;
