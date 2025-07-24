const Category = require("../models/Category");

class CategoryController {
  async getAllCategories(req, res) {
    try {
      const categories = await Category.find({}).populate("subcategories");
      res.json(categories);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error fetching categories", error: error.message });
    }
  }

  async getCategory(req, res) {
    try {
      const category = await Category.findById(req.query.id).populate(
        "subcategories"
      );
      if (!category)
        return res.status(404).json({ message: "Category not found" });
      res.json(category);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error fetching category", error: error.message });
    }
  }
  async createCategory(req, res) {
    try {
      const { name, status } = req.body;
      const newCategory = await Category.create({ name, status });
      res.status(201).json({
        success: true,
        data: newCategory,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to create category",
        error: error.message,
      });
    }
  }
  async updateCategory(req, res) {
    try {
      const { data } = req.body;

      const category = await Category.findByIdAndUpdate(
        req.query.categoryID,
        { name: data.name },
        { new: true }
      );

      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }

      res.status(200).json(category);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update category" });
    }
  }
}

module.exports = new CategoryController();
