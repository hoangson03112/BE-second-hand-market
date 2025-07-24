const express = require("express");
const router = express.Router();
const BankInfoController = require("../controllers/BankInfoController");
const verifyToken = require("../middleware/verifyToken");

router.post("/", verifyToken, BankInfoController.createBankInfo);
router.get("/", verifyToken, BankInfoController.getAllOrderRefund);

module.exports = router;
