const express = require("express");
const router = express.Router();
const BankInfoController = require("./bankInfo.controller");
const verifyToken = require("../../middlewares/verifyToken");
const verifyAdmin = require("../../middlewares/verifyAdmin");
const { uploadConfig } = require("../../middlewares/upload");
const { asyncHandler } = require("../../middlewares/errorHandler");


router.post(
  "/payment-proof",
  verifyToken,
  uploadConfig.single("proof"),
  asyncHandler(BankInfoController.uploadPaymentProof)
);


router.get(
  "/",
  verifyToken,
  verifyAdmin,
  asyncHandler(BankInfoController.getAllOrderRefund)
);


router.get(
  "/:orderId",
  verifyToken,
  asyncHandler(BankInfoController.getProofByOrder)
);


router.patch(
  "/verify/:orderId",
  verifyToken,
  verifyAdmin,
  asyncHandler(BankInfoController.verifyPaymentProof)
);

module.exports = router;