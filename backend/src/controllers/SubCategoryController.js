const Category = require("../models/Category");
const Product = require("../models/Product");
const SubCategory = require("../models/SubCategory");
const slugify = require("slugify");

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

      const newSubcategory = await SubCategory.create(data);

      const updatedCategory = await Category.findByIdAndUpdate(
        req.params.parentCategoryId,
        {
          $push: { subcategories: newSubcategory._id },
        },
        { new: true }
      ).populate("subcategories");

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

      if (!subcategory._id || !subcategory.name) {
        return res.status(400).json({
          success: false,
          message: "Subcategory id and name are required",
        });
      }

      const newSlug = slugify(subcategory.name, {
        lower: true,
        strict: true,
        locale: "vi",
      });

      const updateSubcategory = await SubCategory.findByIdAndUpdate(
        subcategory._id,
        {
          name: subcategory.name,
          slug: newSlug,
          status: subcategory.status,
        },
        { new: true, runValidators: true }
      );
      if (!updateSubcategory) {
        return res.status(404).json({
          success: false,
          message: "Subcategory not found",
        });
      }
      const updatedCategory = await Category.find({}).populate("subcategories");
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
      const { categoryId, subcategoryId } = req.params;

      if (!subcategoryId) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      // Kiểm tra xem có sản phẩm nào đang sử dụng subcategory này không
      const productsUsingSubcategory = await Product.findOne({
        subcategoryId: subcategoryId,
      });

      if (productsUsingSubcategory) {
        return res.status(400).json({
          success: false,
          message:
            "Không thể xóa danh mục con này vì vẫn còn sản phẩm đang sử dụng. Vui lòng chuyển hoặc xóa các sản phẩm trước khi xóa danh mục con.",
          hasProducts: true,
        });
      }
      await SubCategory.findByIdAndDelete(subcategoryId);
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
      ).populate("subcategories");
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
