const Category = require("../models/category");

class SubCategoryController {
  async getSubCategory(req, res) {
    try {
      const categories = await Category.find({});
      const subcategoryID = req.query.SubcategoryID;

      if (!subcategoryID) {
        return res.status(400).json({
          success: false,
          message: "Subcategory ID is required",
        });
      }

      let foundCategory = null;
      let foundSubcategory = null;

      // Duyệt qua tất cả các category để tìm subcategory có id khớp
      for (const category of categories) {
        foundSubcategory = category.subcategories.find(
          (sub) => sub._id.toString() === subcategoryID
        );
        if (foundSubcategory) {
          foundCategory = category;
          break; // Dừng vòng lặp ngay khi tìm thấy subcategory
        }
      }

      if (!foundSubcategory) {
        return res.status(404).json({
          success: false,
          message: "Subcategory not found",
        });
      }

      res.json({
        success: true,
        subcategory: foundSubcategory,
        category: foundCategory,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching categories",
        error: error.message,
      });
    }
  }
  async createSubCategory(req, res) {
    try {
      const data = req.body;

      if (!data) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      const newSubcategory = {
        name: data.name,
        status: data.status,
      };

      const updatedCategory = await Category.findByIdAndUpdate(
        req.params.parentCategoryId,
        {
          $push: { subcategories: newSubcategory },
        },
        { new: true }
      );

      if (!updatedCategory) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      res.json({
        success: true,
        message: "Subcategory created successfully",
        category: updatedCategory,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error creating subcategory",
        error: error.message,
      });
    }
  }
  async updateSubCategory(req, res) {
    try {
      const { subcategory, parentCategoryId } = req.body;

      if (!subcategory || !parentCategoryId) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      const updatedCategory = await Category.findOneAndUpdate(
        {
          _id: parentCategoryId,
          "subcategories._id": subcategory._id,
        },
        {
          $set: {
            "subcategories.$.name": subcategory.name,
            "subcategories.$.status": subcategory.status,
          },
        },
        { new: true }
      );

      if (!updatedCategory) {
        return res.status(404).json({
          success: false,
          message: "Category or subcategory not found",
        });
      }

      res.json({
        success: true,
        message: "Subcategory updated successfully",
        category: updatedCategory,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error updating subcategory",
        error: error.message,
      });
    }
  }
  async deleteSubCategory(req, res) {
    try {
      const { subcategoryId, categoryId } = req.params;

      if (!subcategoryId || !categoryId) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      const updatedCategory = await Category.findByIdAndUpdate(
        categoryId,
        {
          $pull: {
            subcategories: {
              _id: subcategoryId,
            },
          },
        },
        { new: true }
      );
      if (!updatedCategory) {
        return res.status(404).json({
          success: false,
          message: "Category or subcategory not found",
        });
      }

      res.json({
        success: true,
        message: "Subcategory deleted successfully",
        category: updatedCategory,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error deleting subcategory",
        error: error.message,
      });
    }
  }
}

module.exports = new SubCategoryController();
