const SellerReview = require("../../models/SellerReview");
const { MESSAGES } = require('../../utils/messages');

exports.createSellerReview = async (req, res) => {
  try {
    const { sellerId, orderId, rating, comment } = req.body;
    const buyerId = req.accountID;

    // Kiểm tra đã đánh giá chưa (mỗi buyer chỉ được đánh giá 1 lần cho 1 order)
    const existed = await SellerReview.findOne({ sellerId, buyerId, orderId });
    if (existed) {
      return res.status(400).json({ message: MESSAGES.REVIEW.SELLER_ALREADY_REVIEWED });
    }

    const review = new SellerReview({
      sellerId,
      buyerId,
      orderId,
      rating,
      comment,
    });
    await review.save();

    res.status(201).json({ message: MESSAGES.REVIEW.SELLER_REVIEW_SUCCESS, review });
  } catch (error) {
    console.error("Error creating seller review:", error);
    res.status(500).json({ message: MESSAGES.SERVER_ERROR });
  }
};

exports.getReviewByOrder = async (req, res) => {
  try {
    const buyerId = req.accountID;
    const { orderId } = req.params;
    const review = await SellerReview.findOne({ orderId, buyerId });
    res.status(200).json({ review });
  } catch (error) {
    console.error("Error fetching review by order:", error);
    res.status(500).json({ message: MESSAGES.SERVER_ERROR });
  }
};

exports.updateSellerReview = async (req, res) => {
  try {
    const buyerId = req.accountID;
    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    const review = await SellerReview.findOneAndUpdate(
      { _id: reviewId, buyerId },
      { rating, comment, updatedAt: new Date() },
      { new: true }
    );
    if (!review) {
      return res.status(404).json({ message: MESSAGES.REVIEW.SELLER_REVIEW_UPDATE_NOT_FOUND });
    }
    res.status(200).json({ message: MESSAGES.REVIEW.SELLER_REVIEW_UPDATE_SUCCESS, review });
  } catch (error) {
    console.error("Error updating seller review:", error);
    res.status(500).json({ message: MESSAGES.SERVER_ERROR });
  }
};
