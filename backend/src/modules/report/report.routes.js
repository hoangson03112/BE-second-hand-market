const express = require("express");
const router = express.Router();
const ReportController = require("./report.controller");
const verifyToken = require("../../middlewares/verifyToken");
const uploadReportImages = require("../../middlewares/uploadReport");

// Táº¡o bÃ¡o cÃ¡o má»›i
router.post(
  "/",
  verifyToken,
  uploadReportImages,
  ReportController.createReport
);
router.get("/", ReportController.getAllReports);

module.exports = router;

