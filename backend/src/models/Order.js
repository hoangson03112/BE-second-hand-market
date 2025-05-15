const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const OrderSchema = new Schema(
  {
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
    products: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
        },
      },
    ],

    totalAmount: { type: Number, required: true },
    shippingMethod: { type: String, required: true },
    shippingAddress: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
    },
    status: { type: String, default: "PENDING" },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true, collection: "orders" }
);

module.exports = mongoose.model("Order", OrderSchema);
