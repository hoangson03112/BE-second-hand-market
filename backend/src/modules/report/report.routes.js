const express = require("express");
const { safeRouter } = require("../../utils/safeRouter");
const router = safeRouter();
const ReportController = require("./report.controller");
const verifyToken = require("../../middlewares/verifyToken");
const uploadReportImages = require("../../middlewares/uploadReport");


router.post(
  "/",
  verifyToken,
  uploadReportImages,
  ReportController.createReport
);
router.get("/", ReportController.getAllReports);

module.exports = router;