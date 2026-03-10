const express = require("express");
const ProductController = require("./product.controller");
const verifyToken = require("../../middlewares/verifyToken");
const verifyAdmin = require("../../middlewares/verifyAdmin");
const { asyncHandler } = require("../../middlewares/errorHandler");
const {
  uploadConfig,
  commonFields,
  createUpload,
  imageOrVideoFileFilter,
} = require("../../middlewares/upload");
const {
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
} = require("../../middlewares/cache");

const router = express.Router();

const productMediaUpload = createUpload({
  fileFilter: imageOrVideoFileFilter,
  maxSize: 50 * 1024 * 1024,
}).fields(commonFields.product);

router.get(
  "/all",
  createCacheMiddleware({ ttl: 120, keyPrefix: "products-all" }),
  asyncHandler(ProductController.getAllPublicProducts),
);
router.get(
  "/categories",
  createCacheMiddleware({ ttl: 180, keyPrefix: "products-list" }),
  asyncHandler(ProductController.getProductListByCategory),
);
router.get(
  "/search",
  createCacheMiddleware({ ttl: 120, keyPrefix: "products-search" }),
  asyncHandler(ProductController.searchProducts),
);
router.get(
  "/:productID",
  createCacheMiddleware({ ttl: 60, keyPrefix: "product-detail" }),
  asyncHandler(ProductController.getProduct),
);
router.get(
  "/my/listings",
  verifyToken,
  asyncHandler(ProductController.getProductOfUser),
);

router.get(
  "/",
  verifyToken,
  verifyAdmin,
  asyncHandler(ProductController.getProducts),
);
router.post(
  "/",
  verifyToken,
  productMediaUpload,
  createCacheInvalidationMiddleware("products*"),
  createCacheInvalidationMiddleware("product-detail*"),
  asyncHandler(ProductController.addProduct),
);

router.put(
  "/:productId",
  verifyToken,
  uploadConfig.fields([
    { name: "avatar", maxCount: 1 },
    { name: "newImages", maxCount: 10 },
  ]),
  createCacheInvalidationMiddleware("products*"),
  createCacheInvalidationMiddleware("product-detail*"),
  asyncHandler(ProductController.updateProduct),
);

// PATCH /api/v1/products/:productId/status (admin only)
router.patch(
  "/:productId/status",
  verifyToken,
  verifyAdmin,
  createCacheInvalidationMiddleware("products*"),
  createCacheInvalidationMiddleware("product-detail*"),
  asyncHandler(ProductController.updateStatusProduct),
);

// DELETE /api/v1/products/:productId
router.delete(
  "/:productId",
  verifyToken,
  createCacheInvalidationMiddleware("products*"),
  createCacheInvalidationMiddleware("product-detail*"),
  asyncHandler(ProductController.deleteProduct),
);

// POST /api/v1/products/:productId/request-review (user yÃªu cáº§u duyá»‡t láº¡i sáº£n pháº©m bá»‹ reject)
router.post(
  "/:productId/request-review",
  verifyToken,
  createCacheInvalidationMiddleware("products*"),
  createCacheInvalidationMiddleware("product-detail*"),
  asyncHandler(ProductController.requestReview),
);

module.exports = router;
