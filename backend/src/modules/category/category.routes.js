const express = require("express");
const { safeRouter } = require("../../utils/safeRouter");
const CategoryController = require("./category.controller");
const SubCategoryController = require("./subCategory.controller");
const verifyToken = require("../../middlewares/verifyToken");
const verifyAdmin = require("../../middlewares/verifyAdmin");
const {
  longCache,
  createCacheInvalidationMiddleware
} = require("../../middlewares/cache");

const router = safeRouter();


router.get("/", longCache('categories'), CategoryController.getAllCategories);
router.post(
  "/",
  verifyToken,
  verifyAdmin,
  createCacheInvalidationMiddleware('categor*'),
  CategoryController.createCategory
);
router.get("/:id", longCache('category'), CategoryController.getCategory);
router.put(
  "/update",
  verifyToken,
  createCacheInvalidationMiddleware('categor*'),
  CategoryController.updateCategory
);


router.get("/sub", longCache('subcategories'), SubCategoryController.getSubCategory);
router.put(
  "/sub/update",
  verifyToken,
  createCacheInvalidationMiddleware('categor*'),
  SubCategoryController.updateSubCategory
);
router.post(
  "/sub/:parentCategoryId",

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