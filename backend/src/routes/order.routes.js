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
router.put(
  "/:id/ghn-order",
  verifyToken,
  createCacheInvalidationMiddleware('order*'),
  asyncHandler(OrderController.updateGHNOrder)
);
router.get(
  "/seller/my",
  verifyToken,
  asyncHandler(OrderController.getOrdersOfSeller)
);
router.get(
  "/seller/:sellerId",
  verifyToken,
  asyncHandler(OrderController.getOrdersBySeller)
);
router.patch(
  "/seller/update/:orderId",
  verifyToken,
  createCacheInvalidationMiddleware('order*'),
  asyncHandler(OrderController.updateOrderBySeller)
);
router.get(
  "/seller/stats",
  verifyToken,
  cacheByUser({ ttl: 180, keyPrefix: 'order-stats' }),
  asyncHandler(OrderController.getSellerOrderStats)
);
router.patch(
  "/update-payment-status",
  verifyToken,
  createCacheInvalidationMiddleware('order*'),
  asyncHandler(OrderController.updatePaymentStatus)
);
router.patch(
  "/refund/update/:orderId",
  verifyToken,
  createCacheInvalidationMiddleware('order*'),
  asyncHandler(OrderController.updateRefund)
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
  "/:id/totalAmount",
  verifyToken,
  asyncHandler(OrderController.getTotalAmountOfOrder)
);
router.get(
  "/order-details/:id",
  verifyToken,
  cacheByUser({ ttl: 300, keyPrefix: 'order-detail' }),
  asyncHandler(OrderController.getOrderById)
);
router.get(
  "/order-refund",
  verifyToken,
  asyncHandler(OrderController.getOrderRefund)
);
router.get(
  "/:orderId/seller-bank-info",
  verifyToken,
  asyncHandler(OrderController.getSellerBankInfoForOrder)
);
router.patch(
  "/confirm-refund/:orderId",
  verifyToken,
  createCacheInvalidationMiddleware('order*'),
  asyncHandler(OrderController.confirmRefund)
);
router.get(
  "/:id",
  verifyToken,
  asyncHandler(OrderController.getOrderToFeedBack)
);
module.exports = router;
