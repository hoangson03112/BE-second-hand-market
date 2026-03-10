const express = require("express");
const verifyToken = require("../../middlewares/verifyToken");
const {
  uploadConfig,
  commonFields,
} = require("../../middlewares/upload");
const {
  controller: SellerController,
} = require("./seller.controller");
const PersonalDiscountController = require("./personalDiscount.controller");
const {
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
} = require("../../middlewares/cache");

const router = express.Router();

// ROUTES TĨNH ĐẶT TRƯỚC
router.get(
  "/buyers-chatted",
  verifyToken,
  PersonalDiscountController.getBuyersChattedWithSeller
);
router.get(
  "/personal-discount",
  verifyToken,
  PersonalDiscountController.getPersonalDiscounts
);
router.post(
  "/personal-discount",
  verifyToken,
  createCacheInvalidationMiddleware('discount*'),
  PersonalDiscountController.createPersonalDiscount
);
router.delete(
  "/personal-discount/:id",
  verifyToken,
  createCacheInvalidationMiddleware('discount*'),
  PersonalDiscountController.deletePersonalDiscount
);
router.get(
  "/personal-discount/all",
  verifyToken,
  PersonalDiscountController.getPersonalDiscount
);

router.post(
  "/register",
  verifyToken,
  uploadConfig.fields(commonFields.seller),
  createCacheInvalidationMiddleware('seller*'),
  SellerController.registerSeller
);

router.get("/request-status", verifyToken, SellerController.getRequestStatus);
router.get("/product-limit", verifyToken, SellerController.getProductLimit);

// Admin routes
router.get("/admin/all", verifyToken, SellerController.getAllSellers);
router.get("/admin/:id", verifyToken, SellerController.getSellerById);
router.put(
  "/admin/:id/status",
  verifyToken,
  createCacheInvalidationMiddleware('seller*'),
  SellerController.updateSellerStatus
);

// ROUTE ĐỘNG ĐỂ CUỐI CÙNG
router.get(
  "/:accountId",
  verifyToken,
  createCacheMiddleware({ ttl: 600, keyPrefix: 'seller-info' }),
  SellerController.getSellerInfo
);

module.exports = router;

