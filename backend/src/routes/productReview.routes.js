const express = require("express");
const router = express.Router();
const ProductReviewController = require("../controllers/ProductReviewController");
const verifyToken = require("../middleware/verifyToken");
const { asyncHandler } = require("../shared/errors/errorHandler");
const {
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
} = require("../shared/middleware/cache.middleware.functional");

// ⭐ Tạo đánh giá sản phẩm (chỉ buyer đã mua)
router.post(
  "/",
  verifyToken,
  createCacheInvalidationMiddleware("product-review*"),
  asyncHandler(ProductReviewController.createReview)
);

// ⭐ Lấy đánh giá của buyer cho 1 sản phẩm trong 1 order cụ thể
router.get(
  "/by-order/:orderId/product/:productId",
  verifyToken,
  createCacheMiddleware({ ttl: 300, keyPrefix: "product-review" }),
  asyncHandler(ProductReviewController.getByOrderAndProduct)
);

// ⭐ Lấy tất cả đánh giá của 1 sản phẩm (public)
router.get(
  "/product/:productId",
  createCacheMiddleware({ ttl: 180, keyPrefix: "product-review-list" }),
  asyncHandler(ProductReviewController.getByProduct)
);

// ⭐ Lấy tất cả đánh giá của buyer (của chính mình)
router.get(
  "/my",
  verifyToken,
  createCacheMiddleware({ ttl: 300, keyPrefix: "product-review-my" }),
  asyncHandler(ProductReviewController.getMyReviews)
);

// ⭐ Cập nhật đánh giá
router.put(
  "/:reviewId",
  verifyToken,
  createCacheInvalidationMiddleware("product-review*"),
  asyncHandler(ProductReviewController.updateReview)
);

// ⭐ Xóa đánh giá
router.delete(
  "/:reviewId",
  verifyToken,
  createCacheInvalidationMiddleware("product-review*"),
  asyncHandler(ProductReviewController.deleteReview)
);

module.exports = router;
