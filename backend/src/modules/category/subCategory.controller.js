const Category = require("../../models/Category");
const Product = require("../../models/Product");
const SubCategory = require("../../models/SubCategory");
const slugify = require("slugify");
const { MESSAGES } = require('../../utils/messages');

class SubCategoryController {
  async getSubCategory(req, res) {
    try {
      const categories = await Category.find({});
      const subcategoryID = req.query.SubcategoryID;

      if (!subcategoryID) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.CATEGORY.SUBCATEGORY_ID_REQUIRED,
        });
      }

      let foundCategory = null;
      let foundSubcategory = null;

      // Duy\u1ec7t qua t\u1ea5t c\u1ea3 c\u00e1c category \u0111\u1ec3 t\u00ecm subcategory c\u00f3 id kh\u1edbp
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
          message: MESSAGES.CATEGORY.SUBCATEGORY_NOT_FOUND,
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
        message: MESSAGES.CATEGORY.FETCH_ERROR,
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
          message: MESSAGES.MISSING_FIELDS,
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
          message: MESSAGES.CATEGORY.NOT_FOUND,
        });
      }

      res.json({
        success: true,
        message: MESSAGES.CATEGORY.SUBCATEGORY_CREATE_SUCCESS,
        category: updatedCategory,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: MESSAGES.CATEGORY.SUBCATEGORY_CREATE_ERROR,
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
          message: MESSAGES.MISSING_FIELDS,
        });
      }

      if (!subcategory._id || !subcategory.name) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.CATEGORY.SUBCATEGORY_ID_NAME_REQUIRED,
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
          message: MESSAGES.CATEGORY.SUBCATEGORY_NOT_FOUND,
        });
      }
      const updatedCategory = await Category.find({}).populate("subcategories");
      res.json({
        success: true,
        message: MESSAGES.CATEGORY.SUBCATEGORY_UPDATE_SUCCESS,
        category: updatedCategory,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: MESSAGES.CATEGORY.SUBCATEGORY_UPDATE_ERROR,
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
          message: MESSAGES.MISSING_FIELDS,
        });
      }

      // Ki\u1ec3m tra xem c\u00f3 s\u1ea3n ph\u1ea9m n\u00e0o \u0111ang s\u1eed d\u1ee5ng subcategory n\u00e0y kh\u00f4ng
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
          message: MESSAGES.CATEGORY.CATEGORY_OR_SUBCATEGORY_NOT_FOUND,
        });
      }

      res.json({
        success: true,
        message: MESSAGES.CATEGORY.SUBCATEGORY_DELETE_SUCCESS,
        category: updatedCategory,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: MESSAGES.CATEGORY.SUBCATEGORY_DELETE_ERROR,
        error: error.message,
      });
    }
  }
}

module.exports = new SubCategoryController();

