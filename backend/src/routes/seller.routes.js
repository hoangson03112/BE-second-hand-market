const express = require("express");
const verifyToken = require("../middleware/verifyToken");
const {
  uploadConfig,
  commonFields,
} = require("../middleware/uploadMiddleware");
const {
  controller: SellerController,
} = require("../controllers/SellerController");
const PersonalDiscountController = require("../controllers/PersonalDiscountController");

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
  PersonalDiscountController.createPersonalDiscount
);
router.delete(
  "/personal-discount/:id",
  verifyToken,
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
  SellerController.registerSeller
);

// Admin routes
router.get("/admin/all", verifyToken, SellerController.getAllSellers);
router.get("/admin/:id", verifyToken, SellerController.getSellerById);
router.put(
  "/admin/:id/status",
  verifyToken,
  SellerController.updateSellerStatus
);

// ROUTE ĐỘNG ĐỂ CUỐI CÙNG
router.get("/:accountId", verifyToken, SellerController.getSellerInfo);

module.exports = router;
