const express = require("express");
const { safeRouter } = require("../../utils/safeRouter");
const router = safeRouter();
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


// Tiền chuyển khoản đi thẳng vào tài khoản người bán, nên người bán mới là
// người đối soát biên lai. Không dùng verifyAdmin ở đây — quyền (người bán của
// đúng đơn đó, hoặc admin) được kiểm tra trong controller.
router.patch(
  "/verify/:orderId",
  verifyToken,
  asyncHandler(BankInfoController.verifyPaymentProof)
);

module.exports = router;