const express = require("express");
const categoryRoutes = require("./category.routes");
const productRoutes = require("./product.routes");
const accountRoutes = require("./account.routes");
const cartRoutes = require("./cart.routes");
const orderRoutes = require("./order.routes");
const chatRoutes = require("./chat.routes");
const addressRoutes = require("./address.routes");
const blogRoutes = require("./blog.routes");
const voucherRoutes = require("./voucher.routes");
const otpRoutes = require("./otp.routes");
const sellerRoutes = require("./seller.routes");

const coinRoutes = require("./coin.routes");
const adminRoutes = require("./admin.routes");
const testRoutes = require("./test.routes");

function initializeRoutes(app) {
  const router = express.Router();

  router.use("/categories", categoryRoutes);
  router.use("/products", productRoutes);
  router.use("/accounts", accountRoutes);
  router.use("/cart", cartRoutes);
  router.use("/orders", orderRoutes);
  router.use("/chat", chatRoutes);
  router.use("/address", addressRoutes);
  router.use("/blogs", blogRoutes);
  router.use("/vouchers", voucherRoutes);
  router.use("/otp", otpRoutes);
  router.use("/sellers", sellerRoutes);

  router.use("/coins", coinRoutes);
  router.use("/admin", adminRoutes);
  router.use("/test", testRoutes);
  // Mount main router to app
  app.use("/eco-market", router);
}

module.exports = initializeRoutes;
