/**
 * Application-wide Constants
 */

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
};

// Product Status
const PRODUCT_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  INACTIVE: "inactive",
  SOLD: "sold",
  REJECTED: "rejected",
  UNDER_REVIEW: "under_review",
  APPROVED: "approved",
};

// Product Condition
const PRODUCT_CONDITION = {
  NEW: "new",
  LIKE_NEW: "like_new",
  GOOD: "good",
  FAIR: "fair",
  POOR: "poor",
};

// Sort Options
const SORT_OPTIONS = {
  NEWEST: "newest",
  OLDEST: "oldest",
  PRICE_LOW: "price_low",
  PRICE_HIGH: "price_high",
  POPULAR: "popular",
};

// Pagination Defaults
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

// File Upload Limits
const UPLOAD_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_FILES: 10,
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp"],
};

// API Response Messages
const MESSAGES = {
  SUCCESS: "Operation successful",
  CREATED: "Resource created successfully",
  UPDATED: "Resource updated successfully",
  DELETED: "Resource deleted successfully",
  NOT_FOUND: "Resource not found",
  UNAUTHORIZED: "Unauthorized access",
  FORBIDDEN: "Forbidden access",
  VALIDATION_ERROR: "Validation error",
  SERVER_ERROR: "Internal server error",
};

module.exports = {
  HTTP_STATUS,
  PRODUCT_STATUS,
  PRODUCT_CONDITION,
  SORT_OPTIONS,
  PAGINATION,
  UPLOAD_LIMITS,
  MESSAGES,
};






