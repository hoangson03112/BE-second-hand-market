const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const SellerReviewSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
  orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, maxlength: 500 },
}, {
  timestamps: true,
  collection: "seller_reviews"
});

module.exports = mongoose.model("SellerReview", SellerReviewSchema);
