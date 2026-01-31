const express = require("express");
const OrderController = require("../controllers/OrderController");
const verifyToken = require("../middleware/verifyToken");
const { asyncHandler } = require("../shared/errors/errorHandler");

const router = express.Router();

router.post("/", verifyToken, asyncHandler(OrderController.createOrder));
router.get(
  "/my-orders",
  verifyToken,
  asyncHandler(OrderController.getOrderByAccount)
);
router.put(
  "/:id/ghn-order",
  verifyToken,
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
  asyncHandler(OrderController.updateOrderBySeller)
);
router.get(
  "/seller/stats",
  verifyToken,
  asyncHandler(OrderController.getSellerOrderStats)
);
router.patch(
  "/update-payment-status",
  verifyToken,
  asyncHandler(OrderController.updatePaymentStatus)
);
router.patch(
  "/refund/update/:orderId",
  verifyToken,
  asyncHandler(OrderController.updateRefund)
);
router.get(
  "/admin/all",
  verifyToken,
  asyncHandler(OrderController.getOrdersByAdmin)
);
router.patch("/update", verifyToken, asyncHandler(OrderController.updateOrder));
router.get(
  "/:id/totalAmount",
  verifyToken,
  asyncHandler(OrderController.getTotalAmountOfOrder)
);
router.get(
  "/order-details/:id",
  verifyToken,
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
  asyncHandler(OrderController.confirmRefund)
);
router.get(
  "/:id",
  verifyToken,
  asyncHandler(OrderController.getOrderToFeedBack)
);
module.exports = router;
