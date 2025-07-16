const express = require("express");
const OrderController = require("../controllers/OrderController");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

// All order routes require authentication
router.post("/", verifyToken, OrderController.createOrder);
router.get("/my-orders", verifyToken, OrderController.getOrderByAccount);
router.put("/:id/ghn-order", verifyToken, OrderController.updateGHNOrder);
// Seller routes
router.get("/seller/my", verifyToken, OrderController.getOrdersOfSeller);
router.get("/seller/:sellerId", verifyToken, OrderController.getOrdersBySeller);
router.patch(
  "/seller/update/:orderId",
  verifyToken,
  OrderController.updateOrderBySeller
);
router.get("/seller/stats", verifyToken, OrderController.getSellerOrderStats);
router.patch(
  "/update-payment-status",
  verifyToken,
  OrderController.updatePaymentStatus
);
router.get("/admin/all", verifyToken, OrderController.getOrdersByAdmin);
router.patch("/update", verifyToken, OrderController.updateOrder);
router.get(
  "/:id/totalAmount",
  verifyToken,
  OrderController.getTotalAmountOfOrder
);
router.get("/order-details/:id", verifyToken, OrderController.getOrderById);
module.exports = router;
