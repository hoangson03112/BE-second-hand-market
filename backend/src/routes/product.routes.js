const express = require("express");
const ProductController = require("../controllers/ProductController");
const verifyToken = require("../middleware/verifyToken");
const verifyAdmin = require("../middleware/verifyAdmin");
const {
  uploadConfig,
  commonFields,
} = require("../middleware/uploadMiddleware");

const router = express.Router();

router.get("/by-category", ProductController.getProductListByCategory);
router.get("/details", ProductController.getProduct);
router.get("/", ProductController.getProducts);
router.get("/by-user", verifyToken, ProductController.getProductsByUser);
router.get("/my-products", verifyToken, ProductController.getProductOfUser);
router.post(
  "/create",
  verifyToken,
  uploadConfig.fields(commonFields.product),
  ProductController.addProduct
);
router.patch(
  "/update-status",
  verifyToken,
  ProductController.updateStatusProduct
);
router.delete("/:productId", verifyToken, ProductController.deleteProduct);


module.exports = router;
