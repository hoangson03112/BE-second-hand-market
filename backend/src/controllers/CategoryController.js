const Category = require("../models/category");

class CategoryController {
  async getAllCategories(req, res) {
    try {
      const categories = await Category.find({});

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching categories",
        error: error.message,
        cd,
      });
    }
  }

  async getCategory(req, res) {
    const category = await Category.findById(req.query.categoryID);

    res.json({
      success: true,
      data: category,
    });
  }
  async createCategory(req, res) {
    try {
      const { name, slug, status } = req.body;
      const newCategory = await Category.create({ name, slug, status });
      res.status(201).json(newCategory);
    } catch (error) {
      res.status(500).json({ error: "Failed to create category" });
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
