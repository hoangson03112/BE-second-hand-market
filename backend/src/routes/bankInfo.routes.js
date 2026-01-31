const express = require("express");
const router = express.Router();
const BankInfoController = require("../controllers/BankInfoController");
const verifyToken = require("../middleware/verifyToken");
const { uploadConfig } = require("../middleware/uploadMiddleware");
const { asyncHandler } = require("../shared/errors/errorHandler");

router.post(
  "/",
  verifyToken,
  asyncHandler(BankInfoController.createBankInfo)
);
router.post(
  "/payment-proof",
  verifyToken,
  uploadConfig.single("proof"),
  asyncHandler(BankInfoController.uploadPaymentProof)
);
router.get(
  "/",
  verifyToken,
  asyncHandler(BankInfoController.getAllOrderRefund)
);

module.exports = router;
