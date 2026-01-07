/**
 * Enum-like constants for type safety
 */

const ProductStatusEnum = Object.freeze({
  PENDING: "pending",
  ACTIVE: "active",
  INACTIVE: "inactive",
  SOLD: "sold",
  REJECTED: "rejected",
  UNDER_REVIEW: "under_review",
  APPROVED: "approved",
});

const ProductConditionEnum = Object.freeze({
  NEW: "new",
  LIKE_NEW: "like_new",
  GOOD: "good",
  FAIR: "fair",
  POOR: "poor",
});

const SortByEnum = Object.freeze({
  NEWEST: "newest",
  OLDEST: "oldest",
  PRICE_LOW: "price_low",
  PRICE_HIGH: "price_high",
  POPULAR: "popular",
});

const OrderStatusEnum = Object.freeze({
  PENDING: "pending",
  CONFIRMED: "confirmed",
  PROCESSING: "processing",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
});

const UserRoleEnum = Object.freeze({
  USER: "user",
  SELLER: "seller",
  ADMIN: "admin",
});

module.exports = {
  ProductStatusEnum,
  ProductConditionEnum,
  SortByEnum,
  OrderStatusEnum,
  UserRoleEnum,
};






