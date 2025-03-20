const express = require("express");
const CartController = require("../controllers/CartController");
const verifyToken = require("../middlewave/verifyToken");

const router = express.Router();

router.post("/add-to-cart", verifyToken, CartController.addToCart);
router.post("/purchase-now", verifyToken, CartController.purchaseNow);

router.delete("/delete-item", verifyToken, CartController.deleteItem);

router.put("/update-item-quantity", verifyToken, CartController.updateQuantity);

module.exports = router;
