const express = require("express");
const { safeRouter } = require("../../utils/safeRouter");
const router = safeRouter();
const BankInfoController = require("./bankInfo.controller");
const verifyToken = require("../../middlewares/verifyToken");
const { asyncHandler } = require("../../middlewares/errorHandler");

// GET /bank-info (Lấy thông tin tài khoản ngân hàng của user hiện tại)
router.get(
  "/",
  verifyToken,
  asyncHandler(BankInfoController.getMyBankInfo)
);

// PUT /bank-info (Cập nhật / tạo thông tin tài khoản ngân hàng của user hiện tại)
router.put(
  "/",
  verifyToken,
  asyncHandler(BankInfoController.updateMyBankInfo)
);

module.exports = router;