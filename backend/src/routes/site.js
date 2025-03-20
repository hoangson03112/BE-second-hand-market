const express = require("express");
const categoryRoutes = require("./categoryRoutes");
const productRoutes = require("./productRoutes");
const accountRoutes = require("./accountRoutes");
const cartRoutes = require("./cartRoutes");
const chatRoutes = require("./chatRoutes");
const orderRoutes = require("./orderRoutes");

const router = express.Router();

router.use("/categories", categoryRoutes);
router.use("/products", productRoutes);
router.use("/accounts", accountRoutes);
router.use("/cart", cartRoutes);
router.use("/chat", chatRoutes);
router.use("/orders", orderRoutes);

module.exports = router;
