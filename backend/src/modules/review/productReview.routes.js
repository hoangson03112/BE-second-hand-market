const express = require("express");
const router = express.Router();
const ProductReviewController = require("./productReview.controller");
const verifyToken = require("../../middlewares/verifyToken");
const { asyncHandler } = require("../../middlewares/errorHandler");
const {
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
} = require("../../middlewares/cache");

// â­ Táº¡o Ä‘Ã¡nh giÃ¡ sáº£n pháº©m (chá»‰ buyer Ä‘Ã£ mua)
router.post(
  "/",
  verifyToken,
  createCacheInvalidationMiddleware("product-review*"),
  asyncHandler(ProductReviewController.createReview)
);

// â­ Láº¥y Ä‘Ã¡nh giÃ¡ cá»§a buyer cho 1 sáº£n pháº©m trong 1 order cá»¥ thá»ƒ
router.get(
  "/by-order/:orderId/product/:productId",
  verifyToken,
  createCacheMiddleware({ ttl: 300, keyPrefix: "product-review" }),
  asyncHandler(ProductReviewController.getByOrderAndProduct)
);

// â­ Láº¥y táº¥t cáº£ Ä‘Ã¡nh giÃ¡ cá»§a 1 sáº£n pháº©m (public)
router.get(
  "/product/:productId",
  createCacheMiddleware({ ttl: 180, keyPrefix: "product-review-list" }),
  asyncHandler(ProductReviewController.getByProduct)
);

// â­ Láº¥y táº¥t cáº£ Ä‘Ã¡nh giÃ¡ cá»§a buyer (cá»§a chÃ­nh mÃ¬nh)
router.get(
  "/my",
  verifyToken,
  createCacheMiddleware({ ttl: 300, keyPrefix: "product-review-my" }),
  asyncHandler(ProductReviewController.getMyReviews)
);

// â­ Cáº­p nháº­t Ä‘Ã¡nh giÃ¡
router.put(
  "/:reviewId",
  verifyToken,
  createCacheInvalidationMiddleware("product-review*"),
  asyncHandler(ProductReviewController.updateReview)
);

// â­ XÃ³a Ä‘Ã¡nh giÃ¡
router.delete(
  "/:reviewId",
  verifyToken,
  createCacheInvalidationMiddleware("product-review*"),
  asyncHandler(ProductReviewController.deleteReview)
);

module.exports = router;

