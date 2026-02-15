const express = require("express");
const router = express.Router();
const { createSellerReview, getReviewByOrder, updateSellerReview } = require("../controllers/SellerReviewController");
const verifyToken = require("../middleware/verifyToken");
const {
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
} = require("../shared/middleware/cache.middleware.functional");

router.post(
  "/",
  verifyToken,
  createCacheInvalidationMiddleware('review*'),
  createCacheInvalidationMiddleware('seller*'),
  createSellerReview
);
router.get(
  "/by-order/:orderId",
  verifyToken,
  createCacheMiddleware({ ttl: 300, keyPrefix: 'review' }),
  getReviewByOrder
);
router.put(
  "/:reviewId",
  verifyToken,
  createCacheInvalidationMiddleware('review*'),
  createCacheInvalidationMiddleware('seller*'),
  updateSellerReview
);

module.exports = router; 