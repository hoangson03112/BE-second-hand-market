const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const PersonalDiscountSchema = new Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    price: { type: Number, required: true },
    startDate: { type: Date, default: Date.now, required: true },
    endDate: { type: Date, required: true },
    isUse: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: "personal_discounts",
  }
);

module.exports = mongoose.model("PersonalDiscount", PersonalDiscountSchema);
