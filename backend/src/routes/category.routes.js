const express = require("express");
const CategoryController = require("../controllers/CategoryController");
const SubCategoryController = require("../controllers/SubCategoryController");
const verifyToken = require("../middleware/verifyToken");
const {
  longCache,
  createCacheInvalidationMiddleware,
} = require("../shared/middleware/cache.middleware.functional");

const router = express.Router();

// Category routes
router.get("/", longCache('categories'), CategoryController.getAllCategories);
router.get("/:id", longCache('category'), CategoryController.getCategory);
router.put(
  "/update",
  verifyToken,
  createCacheInvalidationMiddleware('categor*'),
  CategoryController.updateCategory
);

// Subcategory routes
router.get("/sub", longCache('subcategories'), SubCategoryController.getSubCategory);
router.put(
  "/sub/update",
  verifyToken,
  createCacheInvalidationMiddleware('categor*'),
  SubCategoryController.updateSubCategory
);
router.post(
  "/sub/:parentCategoryId",
  // verifyToken,
  createCacheInvalidationMiddleware('categor*'),
  SubCategoryController.createSubCategory
);
router.delete(
  "/:categoryId/sub/:subcategoryId",
  verifyToken,
  createCacheInvalidationMiddleware('categor*'),
  SubCategoryController.deleteSubCategory
);

module.exports = router;
