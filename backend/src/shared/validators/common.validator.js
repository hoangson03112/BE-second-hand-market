/**
 * Common validation schemas
 * Reusable Joi schemas for common patterns
 */

const Joi = require("joi");

// MongoDB ObjectId validation
const objectId = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .message("Invalid ObjectId format");

// Pagination schemas
const paginationQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

// Sort schema
const sortQuery = Joi.string().valid(
  "newest",
  "oldest",
  "price-asc",
  "price-desc",
  "name-asc",
  "name-desc"
);

// Search schema
const searchQuery = Joi.object({
  search: Joi.string().trim().min(1).max(200),
  ...paginationQuery,
  sortBy: sortQuery,
});

// ID param schema
const idParam = Joi.object({
  id: objectId.required(),
});

// Price range schema
const priceRangeQuery = Joi.object({
  minPrice: Joi.number().min(0),
  maxPrice: Joi.number().min(0).greater(Joi.ref("minPrice")),
});

// Date range schema
const dateRangeQuery = Joi.object({
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref("startDate")),
});

// Email schema
const email = Joi.string()
  .email({ tlds: { allow: false } })
  .lowercase()
  .trim();

// Password schema
const password = Joi.string()
  .min(6)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  .message(
    "Password must contain at least one uppercase letter, one lowercase letter, and one number"
  );

// Phone number schema (Vietnamese)
const phoneNumber = Joi.string()
  .pattern(/^(0|\+84)[3|5|7|8|9][0-9]{8}$/)
  .message("Invalid Vietnamese phone number");

// URL schema
const url = Joi.string().uri();

// Status enum
const statusEnum = (values) => Joi.string().valid(...values);

module.exports = {
  objectId,
  paginationQuery,
  sortQuery,
  searchQuery,
  idParam,
  priceRangeQuery,
  dateRangeQuery,
  email,
  password,
  phoneNumber,
  url,
  statusEnum,
};
