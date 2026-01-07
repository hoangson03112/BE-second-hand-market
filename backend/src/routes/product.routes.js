const express = require("express");
const ProductController = require("../controllers/ProductController");
const verifyToken = require("../middleware/verifyToken");
const verifyAdmin = require("../middleware/verifyAdmin");
const {
  uploadConfig,
  commonFields,
} = require("../middleware/uploadMiddleware");

const router = express.Router();

router.get("/categories", ProductController.getProductListByCategory);
router.get("/:productID", ProductController.getProduct);
router.get("/users/:userId", verifyToken, ProductController.getProductsByUser);
router.get("/my/listings", verifyToken, ProductController.getProductOfUser);

router.get("/my/seller", verifyToken, ProductController.getProductOfSeller);
router.get("/", verifyToken, verifyAdmin, ProductController.getProducts);
router.post(
  "/",
  verifyToken,
  uploadConfig.fields(commonFields.product),
  ProductController.addProduct
);

// PUT /api/v1/products/:productId
router.put(
  "/:productId",
  verifyToken,
  uploadConfig.fields([
    { name: "avatar", maxCount: 1 },
    { name: "newImages", maxCount: 10 },
  ]),
  ProductController.updateProduct
);

// PATCH /api/v1/products/:productId/status
router.patch(
  "/:productId/status",
  verifyToken,
  ProductController.updateStatusProduct
);

// DELETE /api/v1/products/:productId
router.delete("/:productId", verifyToken, ProductController.deleteProduct);

module.exports = router;
