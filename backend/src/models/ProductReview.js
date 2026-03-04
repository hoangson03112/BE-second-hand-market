const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ProductReviewSchema = new Schema({
  productId: { 
    type: Schema.Types.ObjectId, 
    ref: "Product", 
    required: true 
  },
  buyerId: { 
    type: Schema.Types.ObjectId, 
    ref: "Account", 
    required: true 
  },
  orderId: { 
    type: Schema.Types.ObjectId, 
    ref: "Order", 
    required: true 
  },
  rating: { 
    type: Number, 
    min: 1, 
    max: 5, 
    required: true 
  },
  comment: { 
    type: String, 
    maxlength: 1000 
  },
}, {
  timestamps: true,
  collection: "product_reviews"
});

// Index để tìm nhanh reviews của 1 sản phẩm
ProductReviewSchema.index({ productId: 1, createdAt: -1 });

// Index để check buyer đã review chưa
ProductReviewSchema.index({ productId: 1, buyerId: 1, orderId: 1 }, { unique: true });

module.exports = mongoose.model("ProductReview", ProductReviewSchema);
