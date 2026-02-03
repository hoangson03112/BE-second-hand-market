const express = require("express");
const ProductController = require("../controllers/ProductController");
const verifyToken = require("../middleware/verifyToken");
const verifyAdmin = require("../middleware/verifyAdmin");
const { asyncHandler } = require("../shared/errors/errorHandler");
const {
  uploadConfig,
  commonFields,
  createUpload,
  imageOrVideoFileFilter,
} = require("../middleware/uploadMiddleware");

const router = express.Router();

const productMediaUpload = createUpload({
  fileFilter: imageOrVideoFileFilter,
  maxSize: 50 * 1024 * 1024,
}).fields(commonFields.product);

router.get(
  "/categories",
  asyncHandler(ProductController.getProductListByCategory)
);
router.get("/:productID", asyncHandler(ProductController.getProduct));
router.get(
  "/users/:userId",
  verifyToken,
  asyncHandler(ProductController.getProductsByUser)
);
router.get(
  "/my/listings",
  verifyToken,
  asyncHandler(ProductController.getProductOfUser)
);

router.get(
  "/my/seller",
  verifyToken,
  asyncHandler(ProductController.getProductOfSeller)
);
router.get(
  "/",
  verifyToken,
  verifyAdmin,
  asyncHandler(ProductController.getProducts)
);
router.post(
  "/",
  verifyToken,
  productMediaUpload,
  asyncHandler(ProductController.addProduct)
);

// PUT /api/v1/products/:productId
router.put(
  "/:productId",
  verifyToken,
  uploadConfig.fields([
    { name: "avatar", maxCount: 1 },
    { name: "newImages", maxCount: 10 },
  ]),
  asyncHandler(ProductController.updateProduct)
);

// PATCH /api/v1/products/:productId/status (admin only)
router.patch(
  "/:productId/status",
  verifyToken,
  verifyAdmin,
  asyncHandler(ProductController.updateStatusProduct)
);

// DELETE /api/v1/products/:productId
router.delete(
  "/:productId",
  verifyToken,
  asyncHandler(ProductController.deleteProduct)
);

module.exports = router;
