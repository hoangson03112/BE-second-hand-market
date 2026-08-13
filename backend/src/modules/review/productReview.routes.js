const express = require("express");
const router = express.Router();
const ProductReviewController = require("./productReview.controller");
const verifyToken = require("../../middlewares/verifyToken");
const { asyncHandler } = require("../../middlewares/errorHandler");
const {
  createCacheMiddleware,
  createCacheInvalidationMiddleware
} = require("../../middlewares/cache");


router.post(
  "/",
  verifyToken,
  createCacheInvalidationMiddleware("product-review*"),
  asyncHandler(ProductReviewController.createReview)
);


router.get(
  "/by-order/:orderId/product/:productId",
  verifyToken,
  createCacheMiddleware({ ttl: 300, keyPrefix: "product-review" }),
  asyncHandler(ProductReviewController.getByOrderAndProduct)
);


router.get(
  "/product/:productId",
  createCacheMiddleware({ ttl: 180, keyPrefix: "product-review-list" }),
  asyncHandler(ProductReviewController.getByProduct)
);


router.get(
  "/my",
  verifyToken,
  createCacheMiddleware({ ttl: 300, keyPrefix: "product-review-my" }),
  asyncHandler(ProductReviewController.getMyReviews)
);


router.put(
  "/:reviewId",
  verifyToken,
  createCacheInvalidationMiddleware("product-review*"),
  asyncHandler(ProductReviewController.updateReview)
);


router.delete(
  "/:reviewId",
  verifyToken,
  createCacheInvalidationMiddleware("product-review*"),
  asyncHandler(ProductReviewController.deleteReview)
);

module.exports = router;