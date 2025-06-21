const express = require("express");
const verifyToken = require("../middleware/verifyToken");
const {
  uploadConfig,
  commonFields,
} = require("../middleware/uploadMiddleware");
const {
  controller: SellerController,
} = require("../controllers/SellerController");

const router = express.Router();

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

module.exports = router;
