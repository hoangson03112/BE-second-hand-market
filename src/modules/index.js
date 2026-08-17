const express = require("express");


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




const router = express.Router();


router.use("/auth", authRoutes);
router.use("/accounts", authRoutes);


router.use("/categories", categoryRoutes);
router.use("/products", productRoutes);
router.use("/orders", orderRoutes);
router.use("/cart", cartRoutes);


router.use("/chat", chatRoutes);
router.use("/blogs", blogRoutes);


router.use("/sellers", sellerRoutes);
router.use("/seller-reviews", sellerReviewRoutes);
router.use("/product-reviews", productReviewRoutes);


router.use("/refunds", refundRoutes);


router.use("/bank-info", bankInfoRoutes);


router.use("/addresses", addressRoutes);
router.use("/reports", reportRoutes);


router.use("/admin", adminRoutes);


router.use("/notifications", notificationRoutes);

module.exports = router;