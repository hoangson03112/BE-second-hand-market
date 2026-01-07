const { body, query, param } = require("express-validator");
const { PRODUCT_CONDITION, SORT_OPTIONS } = require("../constants");

/**
 * Product Validation Rules
 */

// Create Product
const validateCreateProduct = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Product name is required")
    .isLength({ min: 3, max: 200 })
    .withMessage("Product name must be between 3 and 200 characters"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("Description must not exceed 5000 characters"),
  body("price")
    .isFloat({ min: 0 })
    .withMessage("Price must be a positive number"),
  body("stock")
    .isInt({ min: 0 })
    .withMessage("Stock must be a non-negative integer"),
  body("categoryId")
    .notEmpty()
    .withMessage("Category ID is required")
    .isMongoId()
    .withMessage("Invalid category ID format"),
  body("subcategoryId")
    .notEmpty()
    .withMessage("Subcategory ID is required")
    .isMongoId()
    .withMessage("Invalid subcategory ID format"),
  body("condition")
    .optional()
    .isIn(Object.values(PRODUCT_CONDITION))
    .withMessage(`Condition must be one of: ${Object.values(PRODUCT_CONDITION).join(", ")}`),
];

// Update Product
const validateUpdateProduct = [
  param("productId")
    .isMongoId()
    .withMessage("Invalid product ID format"),
  body("name")
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage("Product name must be between 3 and 200 characters"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("Description must not exceed 5000 characters"),
  body("price")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Price must be a positive number"),
  body("stock")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Stock must be a non-negative integer"),
];

// Get Products by Category
const validateGetProductsByCategory = [
  query("categoryId")
    .optional()
    .isMongoId()
    .withMessage("Invalid category ID format"),
  query("subCategory")
    .optional()
    .isMongoId()
    .withMessage("Invalid subcategory ID format"),
  query("sortBy")
    .optional()
    .isIn(Object.values(SORT_OPTIONS))
    .withMessage(`Sort by must be one of: ${Object.values(SORT_OPTIONS).join(", ")}`),
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("minPrice")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Min price must be a positive number"),
  query("maxPrice")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Max price must be a positive number"),
  query("condition")
    .optional()
    .isIn(Object.values(PRODUCT_CONDITION))
    .withMessage(`Condition must be one of: ${Object.values(PRODUCT_CONDITION).join(", ")}`),
];

// Get Product by ID
const validateGetProduct = [
  param("id")
    .isMongoId()
    .withMessage("Invalid product ID format"),
];

module.exports = {
  validateCreateProduct,
  validateUpdateProduct,
  validateGetProductsByCategory,
  validateGetProduct,
};






