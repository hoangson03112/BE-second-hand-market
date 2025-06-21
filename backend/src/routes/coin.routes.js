const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const CoinController = require("../controllers/CoinController");

// Điểm danh nhận xu
router.post("/check-in", verifyToken, CoinController.checkIn);

// Lấy số dư xu
router.get("/balance", verifyToken, CoinController.getBalance);

// Sử dụng xu (khi thanh toán)
router.post("/use", verifyToken, CoinController.useCoins);

module.exports = router;