const express = require("express");

// ==================== IMPORT ROUTES ====================
// Core business routes
const accountRoutes = require("./account.routes");
const categoryRoutes = require("./category.routes");
const productRoutes = require("./product.routes");
const orderRoutes = require("./order.routes");
const cartRoutes = require("./cart.routes");

// Communication & Social routes
const chatRoutes = require("./chat.routes");
const blogRoutes = require("./blog.routes");

// Seller & Business routes
const sellerRoutes = require("./seller.routes");
const sellerReviewRoutes = require("./sellerReview.routes");

// Payment & Financial routes
const paymentRoutes = require("./payment.routes");
const bankInfoRoutes = require("./bankInfo.routes");

// Support & Utility routes
const addressRoutes = require("./address.routes");
const pickupAddressRoutes = require("./pickupAddress.routes");
const otpRoutes = require("./otp.routes");
const reportRoutes = require("./report.routes");

// Admin & Management routes
const adminRoutes = require("./admin.routes");

// ==================== ROUTES ====================
// This router is mounted at /eco-market in app.js

const router = express.Router();

// Authentication & Account Management
router.use("/auth", accountRoutes);
router.use("/accounts", accountRoutes);

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

// Payment & Financial
router.use("/payments", paymentRoutes);
router.use("/bank-info", bankInfoRoutes);

// Support & Utilities
router.use("/addresses", addressRoutes);
router.use("/pickup-address", pickupAddressRoutes);
router.use("/otp", otpRoutes);
router.use("/reports", reportRoutes);

// Administration
router.use("/admin", adminRoutes);

module.exports = router;
