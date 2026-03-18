const express = require("express");
const verifyToken = require("../../middlewares/verifyToken");
const verifyAdmin = require("../../middlewares/verifyAdmin");
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

// Seller self: update bank info (must be before /:accountId)
router.put(
  "/me/bank-info",
  verifyToken,
  createCacheInvalidationMiddleware("seller*"),
  SellerController.updateMyBankInfo
);

// Admin routes
router.get("/admin/all", verifyToken, verifyAdmin, SellerController.getAllSellers);
router.get("/admin/:id", verifyToken, verifyAdmin, SellerController.getSellerById);
router.put(
  "/admin/:id/status",
  verifyToken,
  verifyAdmin,
  createCacheInvalidationMiddleware('seller*'),
  createCacheInvalidationMiddleware('account*'),
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

