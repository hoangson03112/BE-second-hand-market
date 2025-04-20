const express = require("express");
const CategoryController = require("../controllers/CategoryController");
const SubCategoryController = require("../controllers/SubCategoryController");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

// Category routes
router.get("/", CategoryController.getAllCategories);
router.get("/details", CategoryController.getCategory);
router.put("/update", verifyToken, CategoryController.updateCategory);

// Subcategory routes
router.get("/sub", SubCategoryController.getSubCategory);
router.put("/sub/update", verifyToken, SubCategoryController.updateSubCategory);
router.post(
  "/sub/:parentCategoryId",
  verifyToken,
  SubCategoryController.createSubCategory
);
router.delete(
  "/:categoryId/sub/:subcategoryId",
  verifyToken,
  SubCategoryController.deleteSubCategory
);

module.exports = router;
