const SellerReview = require("../models/SellerReview");

exports.createSellerReview = async (req, res) => {
  try {
    const { sellerId, orderId, rating, comment } = req.body;
    const userId = req.accountID; // Lấy từ middleware xác thực

    // Kiểm tra đã đánh giá chưa (mỗi user chỉ được đánh giá 1 lần cho 1 order)
    const existed = await SellerReview.findOne({ sellerId, userId, orderId });
    if (existed) {
      return res.status(400).json({ message: "Bạn đã đánh giá đơn hàng này rồi!" });
    }

    const review = new SellerReview({
      sellerId,
      userId,
      orderId,
      rating,
      comment,
    });
    await review.save();

    res.status(201).json({ message: "Đánh giá thành công!", review });
  } catch (error) {
    console.error("Error creating seller review:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getReviewByOrder = async (req, res) => {
  try {
    const userId = req.accountID;
    const { orderId } = req.params;
    const review = await SellerReview.findOne({ orderId, userId });
    res.status(200).json({ review });
  } catch (error) {
    console.error("Error fetching review by order:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Cập nhật đánh giá
exports.updateSellerReview = async (req, res) => {
  try {
    const userId = req.accountID;
    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    const review = await SellerReview.findOneAndUpdate(
      { _id: reviewId, userId },
      { rating, comment, updatedAt: new Date() },
      { new: true }
    );
    if (!review) {
      return res.status(404).json({ message: "Không tìm thấy đánh giá hoặc bạn không có quyền sửa." });
    }
    res.status(200).json({ message: "Cập nhật đánh giá thành công!", review });
  } catch (error) {
    console.error("Error updating seller review:", error);
    res.status(500).json({ message: "Server error" });
  }
}; 