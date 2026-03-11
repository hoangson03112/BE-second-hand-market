const express = require("express");

// ==================== IMPORT MODULE ROUTES ====================
const authRoutes = require("./auth/auth.routes");
const categoryRoutes = require("./category/category.routes");
const productRoutes = require("./product/product.routes");
const orderRoutes = require("./order/order.routes");
const cartRoutes = require("./cart/cart.routes");
const chatRoutes = require("./chat/chat.routes");
const blogRoutes = require("./blog/blog.routes");
const sellerRoutes = require("./seller/seller.routes");
const sellerReviewRoutes = require("./review/sellerReview.routes");
const productReviewRoutes = require("./review/productReview.routes");
const refundRoutes = require("./refund/refund.routes");
const bankInfoRoutes = require("./bankInfo/bankInfo.routes");
const addressRoutes = require("./address/address.routes");
const reportRoutes = require("./report/report.routes");
const adminRoutes = require("./admin/admin.routes");
const notificationRoutes = require("./notification/notification.routes");

// ==================== ROUTER ====================
// This router is mounted at /eco-market in app.js

const router = express.Router();

// Authentication & Account Management
router.use("/auth", authRoutes);
router.use("/accounts", authRoutes);

// Core Business Resources
router.use("/categories", categoryRoutes);
router.use("/products", productRoutes);
router.use("/orders", orderRoutes);
router.use("/cart", cartRoutes);

// Communication & Content
router.use("/chat", chatRoutes);
router.use("/blogs", blogRoutes);

// Seller Management
router.use("/sellers", sellerRoutes);
router.use("/seller-reviews", sellerReviewRoutes);
router.use("/product-reviews", productReviewRoutes);

// Refund & Returns
router.use("/refunds", refundRoutes);

// Payment & Financial
router.use("/bank-info", bankInfoRoutes);

// Support & Utilities
router.use("/addresses", addressRoutes);
router.use("/reports", reportRoutes);

// Administration
router.use("/admin", adminRoutes);

// Notifications
router.use("/notifications", notificationRoutes);

module.exports = router;
