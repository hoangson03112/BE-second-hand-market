// backend/src/routes/shipping.routes.js
const express = require("express");
const router = express.Router();
const ghnService = require("../services/external/ghnClient");
const verifyToken = require("../middlewares/verifyToken"); // Chỉ user đăng nhập mới tính phí/tạo đơn

// FE sẽ gọi route này
router.post("/calculate-fee", verifyToken, async (req, res) => {
  try {
    const feeData = await ghnService.calculateShippingFee(req.body);
    return res.status(200).json({ success: true, data: feeData });
  } catch (error) {
    return res.status(502).json({ success: false, message: "Không thể tính phí vận chuyển lúc này." });
  }
});

module.exports = router;
