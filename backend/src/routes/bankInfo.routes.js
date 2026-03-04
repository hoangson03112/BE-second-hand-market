const express = require("express");
const router = express.Router();
const BankInfoController = require("../controllers/BankInfoController");
const verifyToken = require("../middleware/verifyToken");
const verifyAdmin = require("../middleware/verifyAdmin");
const { uploadConfig } = require("../middleware/uploadMiddleware");
const { asyncHandler } = require("../shared/errors/errorHandler");

// Buyer upload ảnh biên lai chuyển khoản cho 1 order
router.post(
  "/payment-proof",
  verifyToken,
  uploadConfig.single("proof"),
  asyncHandler(BankInfoController.uploadPaymentProof)
);

// Admin lấy danh sách tất cả proof (filter theo ?status=pending|verified|rejected)
router.get(
  "/",
  verifyToken,
  verifyAdmin,
  asyncHandler(BankInfoController.getAllOrderRefund)
);

// Lấy proof của 1 order cụ thể
router.get(
  "/:orderId",
  verifyToken,
  asyncHandler(BankInfoController.getProofByOrder)
);

// Admin xác nhận / từ chối proof chuyển khoản
router.patch(
  "/verify/:orderId",
  verifyToken,
  verifyAdmin,
  asyncHandler(BankInfoController.verifyPaymentProof)
);

module.exports = router;
