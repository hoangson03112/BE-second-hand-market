const category = require("../models/category");

class SubCategoryController {
  async getSubCategory(req, res) {
    try {
      const categories = await category.find({});
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
}

module.exports = new SubCategoryController();
