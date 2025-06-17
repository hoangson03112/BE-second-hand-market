const express = require("express");
const verifyToken = require("../middleware/verifyToken");
const {
  controller: SellerController,
} = require("../controllers/SellerController");
const multer = require("multer");
const router = express.Router();
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Chỉ chấp nhận file ảnh!"), false);
  }
};
// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // Limit file size to 20MB
  },
});

router.post(
  "/register",
  verifyToken,
  upload.single("avatar"),
  upload.single("idCardBack"),
  upload.single("idCardFront"),
  SellerController.registerSeller
);

module.exports = router;
