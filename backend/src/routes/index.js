const express = require("express");
const categoryRoutes = require("./category.routes");
const productRoutes = require("./product.routes");
const accountRoutes = require("./account.routes");
const cartRoutes = require("./cart.routes");
const orderRoutes = require("./order.routes");
const chatRoutes = require("./chat.routes");
const debugRoutes = require("./debug.routes");

/**
 * Initialize all routes for the application
 * @param {express.Application} app - Express application instance
 */
function initializeRoutes(app) {
  const router = express.Router();

  // Mount all route modules
  router.use("/categories", categoryRoutes);
  router.use("/products", productRoutes);
  router.use("/accounts", accountRoutes);
  router.use("/cart", cartRoutes);
  router.use("/orders", orderRoutes);
  router.use("/chat", chatRoutes);

  // Debug routes
  router.use("/debug", debugRoutes);

  // Mount main router to app
  app.use("/eco-market", router);
}

module.exports = initializeRoutes;
