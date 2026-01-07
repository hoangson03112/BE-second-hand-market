const express = require("express");
const router = express.Router();
const { createSellerReview, getReviewByOrder, updateSellerReview } = require("../controllers/SellerReviewController");
const verifyToken = require("../middleware/verifyToken");

router.post("/", verifyToken, createSellerReview);
router.get("/by-order/:orderId", verifyToken, getReviewByOrder);
router.put("/:reviewId", verifyToken, updateSellerReview);

module.exports = router; 