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

// API Response Messages (generic fallbacks - prefer using utils/messages.js for module-specific messages)
const MESSAGES = {
  SUCCESS: "Thao tác thành công",
  CREATED: "Tạo mới thành công",
  UPDATED: "Cập nhật thành công",
  DELETED: "Xóa thành công",
  NOT_FOUND: "Không tìm thấy",
  UNAUTHORIZED: "Không có quyền truy cập",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này",
  VALIDATION_ERROR: "Dữ liệu không hợp lệ",
  SERVER_ERROR: "Lỗi máy chủ",
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






