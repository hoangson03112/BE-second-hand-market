const express = require("express");
const OrderController = require("../controllers/OrderController");
const verifyToken = require("../middlewave/verifyToken");

const router = express.Router();

router.get("/my-orders", verifyToken, OrderController.getOrderByAccount);

router.post("/", verifyToken, OrderController.createOrder);

router.patch("/update-order", verifyToken, OrderController.updateOrder);

module.exports = router;
