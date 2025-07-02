const express = require("express");
const OrderController = require("../controllers/OrderController");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

// All order routes require authentication
router.post("/", verifyToken, OrderController.createOrder);
router.get("/my-orders", verifyToken, OrderController.getOrderByAccount);

// Seller routes
router.get("/my-seller-orders", verifyToken, OrderController.getMySellerOrders);
router.get("/seller/:sellerId", verifyToken, OrderController.getOrdersBySeller);
router.patch("/seller/update", verifyToken, OrderController.updateOrderBySeller);
router.get("/seller/stats", verifyToken, OrderController.getSellerOrderStats);

router.get("/admin/all", verifyToken, OrderController.getOrdersByAdmin);
router.patch("/update", verifyToken, OrderController.updateOrder);
router.get(
  "/:id/totalAmount",
  verifyToken,
  OrderController.getTotalAmountOfOrder
);
router.get("/order-details/:id", verifyToken, OrderController.getOrderById);
module.exports = router;
