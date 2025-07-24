const express = require("express");
const router = express.Router();
const ReportController = require("../controllers/ReportController");
const verifyToken = require("../middleware/verifyToken");
const uploadReportImages = require("../middleware/uploadReportImages");

// Tạo báo cáo mới
router.post(
  "/",
  verifyToken,
  uploadReportImages,
  ReportController.createReport
);
router.get("/", ReportController.getAllReports);

router.patch("/order/:id", ReportController.updateReportOrderRefund);

module.exports = router;
