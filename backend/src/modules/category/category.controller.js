const Category = require("../../models/Category");
const slugify = require("slugify");
const { MESSAGES } = require('../../utils/messages');

class CategoryController {
  async getAllCategories(req, res) {
    try {
      const categories = await Category.find({}).populate("subcategories");
      res.json({
        data: categories.map((category) => ({
          _id: category._id,
          name: category.name,
          slug: category.slug,
          status: category.status,
          subCategories: category.subcategories.map((subcategory) => ({
            _id: subcategory._id,
            name: subcategory.name,
            status: subcategory.status,
            slug: subcategory.slug,
          })),
        })),
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: MESSAGES.CATEGORY.FETCH_ERROR, error: error.message });
    }
  }

  async getCategory(req, res) {
    try {
      const category = await Category.findById(req.params.id).populate(
        "subcategories",
      );
      if (!category)
        return res.status(404).json({ message: MESSAGES.CATEGORY.NOT_FOUND });
      res.json(category);
    } catch (error) {
      res
        .status(500)
        .json({ message: MESSAGES.CATEGORY.FETCH_ERROR, error: error.message });
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
        message: MESSAGES.CATEGORY.CREATE_FAILED,
        error: error.message,
      });
    }
  }
  async updateCategory(req, res) {
    try {
      const { data } = req.body;

      if (!data || !data.name) {
        return res
          .status(400)
          .json({ error: "Missing category data or name field" });
      }

      const categoryId = req.query.categoryID;
      if (!categoryId) {
        return res
          .status(400)
          .json({ error: "categoryID query param is required" });
      }

      const newSlug = slugify(data.name, {
        lower: true,
        strict: true,
        locale: "vi",
      });

      const update = {
        name: data.name,
        slug: newSlug,
      };

      if (data.status && ["active", "inactive"].includes(data.status)) {
        update.status = data.status;
      }

      const category = await Category.findByIdAndUpdate(categoryId, update, {
        new: true,
        runValidators: true,
      });

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
