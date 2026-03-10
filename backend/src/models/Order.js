"use strict";
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const { ORDER_STATUS } = require("../utils/orderStateMachine");

const PAYMENT_METHOD = ["cod", "bank_transfer"];
const PAYMENT_STATUS = ["pending", "paid", "refunded"];
const PAYOUT_STATUS  = ["pending", "paid"];

const OrderSchema = new Schema(
  {
    // --- Core ---
    buyerId:  { type: Schema.Types.ObjectId, ref: "Account", required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "Account", required: true },

    products: [
      {
        productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
        quantity:  { type: Number, required: true },
        price:     { type: Number, required: true },
      },
    ],

    // --- Money ---
    productAmount: { type: Number, default: 0 },
    shippingFee:   { type: Number, default: 0 },
    platformFee:   { type: Number, default: 0 },
    totalAmount:   { type: Number, required: true },

    // --- Shipping ---
    shippingAddress: { type: Schema.Types.ObjectId, ref: "Address" },
    shippingMethod:  { type: String, required: true },

    // --- Payment ---
    paymentMethod: { type: String, enum: PAYMENT_METHOD, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUS, default: "pending" },
    paymentVerifiedAt: { type: Date, default: null },
    paymentVerifiedBy: { type: Schema.Types.ObjectId, ref: "Account", default: null },

    // --- Payout ---
    payoutStatus: { type: String, enum: PAYOUT_STATUS, default: "pending" },
    payoutAt:     { type: Date, default: null },

    // --- Order status ---
    status: { type: String, default: "pending", enum: ORDER_STATUS },

    cancelReason: { type: String, default: "", trim: true },
    refundReason: { type: String, default: "", trim: true },

    // --- GHN ---
    ghnOrderCode:        { type: String, unique: true, sparse: true },
    ghnSortCode:         { type: String },
    ghnTrackingUrl:      { type: String },
    ghnStatus:           { type: String, default: "pending" },
    ghnOrderInfo:        { type: Schema.Types.Mixed },
    transType:           { type: String },
    expectedDeliveryTime:{ type: Date },

    // --- GHN Return Shipment ---
    ghnReturnOrderCode:  { type: String, unique: true, sparse: true },
    ghnReturnTrackingUrl:{ type: String },

    // --- Refund link ---
    refundRequestId: { type: Schema.Types.ObjectId, ref: "Refund", default: null },

    // --- Status history ---
    statusHistory: [
      {
        status:    { type: String },
        updatedAt: { type: Date },
      },
    ],

    // --- Business timestamps ---
    confirmedAt:       { type: Date },
    pickedUpAt:        { type: Date },
    shippingAt:        { type: Date },
    outForDeliveryAt:  { type: Date },
    deliveredAt:       { type: Date },
    completedAt:       { type: Date },
    cancelledAt:       { type: Date },
    deliveryFailedAt:  { type: Date },
    returnWindowExpiresAt: { type: Date },
    buyerConfirmedAt:      { type: Date },
    sellerReceivedAt:      { type: Date },
    returningAt:       { type: Date },
    returnedAt:        { type: Date },
    refundRequestedAt: { type: Date },
    refundApprovedAt:  { type: Date },
    refundedAt:        { type: Date },
  },
  {
    timestamps: true,
    collection: "orders",
  },
);

OrderSchema.index({ buyerId: 1, createdAt: -1 });
OrderSchema.index({ sellerId: 1, createdAt: -1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ payoutStatus: 1 });

module.exports = mongoose.model("Order", OrderSchema);
