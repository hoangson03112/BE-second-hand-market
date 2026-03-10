const express = require("express");
const router = express.Router();
const { createSellerReview, getReviewByOrder, updateSellerReview } = require("./sellerReview.controller");
const verifyToken = require("../../middlewares/verifyToken");
const {
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
} = require("../../middlewares/cache");

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
