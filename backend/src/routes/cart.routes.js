const express = require("express");
const CartController = require("../controllers/CartController");
const verifyToken = require("../middleware/verifyToken");
const {
  cacheByUser,
  createCacheInvalidationMiddleware,
} = require("../shared/middleware/cache.middleware.functional");

const router = express.Router();

// All cart routes require authentication
router.get(
  "/",
  verifyToken,
  cacheByUser({ ttl: 60, keyPrefix: 'cart' }),
  CartController.getCart
);
router.post(
  "/add",
  verifyToken,
  createCacheInvalidationMiddleware('cart*'),
  CartController.addToCart
);
router.post(
  "/purchase-now",
  verifyToken,
  createCacheInvalidationMiddleware('cart*'),
  CartController.purchaseNow
);
router.delete(
  "/delete-item",
  verifyToken,
  createCacheInvalidationMiddleware('cart*'),
  CartController.deleteItem
);
router.put(
  "/update-quantity",
  verifyToken,
  createCacheInvalidationMiddleware('cart*'),
  CartController.updateQuantity
);
router.delete(
  "/clear",
  verifyToken,
  createCacheInvalidationMiddleware('cart*'),
  CartController.clearCart
);
module.exports = router;
