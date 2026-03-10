const express = require("express");
const router = express.Router();
const BankInfoController = require("./bankInfo.controller");
const verifyToken = require("../../middlewares/verifyToken");
const verifyAdmin = require("../../middlewares/verifyAdmin");
const { uploadConfig } = require("../../middlewares/upload");
const { asyncHandler } = require("../../middlewares/errorHandler");

// Buyer upload áº£nh biÃªn lai chuyá»ƒn khoáº£n cho 1 order
router.post(
  "/payment-proof",
  verifyToken,
  uploadConfig.single("proof"),
  asyncHandler(BankInfoController.uploadPaymentProof)
);

// Admin láº¥y danh sÃ¡ch táº¥t cáº£ proof (filter theo ?status=pending|verified|rejected)
router.get(
  "/",
  verifyToken,
  verifyAdmin,
  asyncHandler(BankInfoController.getAllOrderRefund)
);

// Láº¥y proof cá»§a 1 order cá»¥ thá»ƒ
router.get(
  "/:orderId",
  verifyToken,
  asyncHandler(BankInfoController.getProofByOrder)
);

// Admin xÃ¡c nháº­n / tá»« chá»‘i proof chuyá»ƒn khoáº£n
router.patch(
  "/verify/:orderId",
  verifyToken,
  verifyAdmin,
  asyncHandler(BankInfoController.verifyPaymentProof)
);

module.exports = router;

