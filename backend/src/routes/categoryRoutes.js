const express = require("express");
const CategoryController = require("../controllers/CategoryController");

const router = express.Router();

router.get("/", CategoryController.getAllCategories);
router.get("/:id", CategoryController.getCategory);
// router.post("/", CategoryController.createCategory);
// router.put("/:id", CategoryController.updateCategory);
// router.delete("/:id", CategoryController.deleteCategory);

module.exports = router;
