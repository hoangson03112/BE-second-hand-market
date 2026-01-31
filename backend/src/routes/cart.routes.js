const express = require("express");
const CartController = require("../controllers/CartController");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

// All cart routes require authentication
router.get("/", verifyToken, CartController.getCart);
router.post("/add", verifyToken, CartController.addToCart);
router.post("/purchase-now", verifyToken, CartController.purchaseNow);
router.delete("/delete-item", verifyToken, CartController.deleteItem);
router.put("/update-quantity", verifyToken, CartController.updateQuantity);
router.delete("/clear", verifyToken, CartController.clearCart);
module.exports = router;
