const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const OrderSchema = new Schema(
  {
    ghnOrderCode: { type: String, unique: true, sparse: true },
    ghnSortCode: { type: String },
    expectedDeliveryTime: { type: Date },
    transType: { type: String },
    shippingFee: { type: Number, default: 0 },
    insuranceFee: { type: Number, default: 0 },
    codFee: { type: Number, default: 0 },
    totalShippingFee: { type: Number, default: 0 },
    ghnTrackingUrl: { type: String },
    ghnStatus: { type: String, default: "pending" },
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
    reason: { type: String, default: "" },
    totalAmount: { type: Number, required: true },
    shippingMethod: { type: String, required: true },
    paymentMethod: { type: String, required: true },
    statusPayment: { type: Boolean, default: false },
    shippingAddress: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
    },
    deliveredAt: { type: Date },
    status: { type: String, default: "pending" },
    transactionId: { type: String, unique: true, sparse: true },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true, collection: "orders" }
);

module.exports = mongoose.model("Order", OrderSchema);
