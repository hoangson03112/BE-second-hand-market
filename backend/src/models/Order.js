"use strict";
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const { ORDER_STATUS } = require("../utils/orderStateMachine");

const PAYMENT_METHOD = ["cod", "bank_transfer"];
const PAYMENT_STATUS = ["pending", "paid", "refunded"];
const PAYOUT_STATUS = ["pending", "paid"];

const ProductLineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const StatusHistoryEntrySchema = new Schema(
  {
    status: { type: String, required: true, trim: true },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

/**
 * Đơn hàng — tiền & trạng thái giao/hoàn tiền.
 * Chi tiết hoàn tiền (lý do, bằng chứng, …) nằm trong Refund (refundRequestId).
 */
const OrderSchema = new Schema(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "Account", required: true },

    products: {
      type: [ProductLineSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "Đơn hàng cần ít nhất một sản phẩm",
      },
    },

    productAmount: { type: Number, default: 0, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    platformFee: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },

    shippingAddress: { type: Schema.Types.ObjectId, ref: "Address" },
    shippingMethod: { type: String, required: true, trim: true },

    paymentMethod: { type: String, enum: PAYMENT_METHOD, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUS, default: "pending" },
    paymentVerifiedAt: { type: Date, default: null },
    paymentVerifiedBy: { type: Schema.Types.ObjectId, ref: "Account", default: null },

    payoutStatus: { type: String, enum: PAYOUT_STATUS, default: "pending" },
    payoutAt: { type: Date, default: null },

    status: { type: String, default: "pending", enum: ORDER_STATUS },

    cancelReason: { type: String, default: "", trim: true },

    ghnOrderCode: { type: String, unique: true, sparse: true, trim: true },
    ghnSortCode: { type: String, trim: true },
    ghnTrackingUrl: { type: String, trim: true },
    ghnStatus: { type: String, default: "pending", trim: true },
    ghnOrderInfo: { type: Schema.Types.Mixed },
    transType: { type: String, trim: true },
    expectedDeliveryTime: { type: Date },

    ghnReturnOrderCode: { type: String, unique: true, sparse: true, trim: true },
    ghnReturnTrackingUrl: { type: String, trim: true },
    ghnReturnOrderInfo: { type: Schema.Types.Mixed },

    refundRequestId: {
      type: Schema.Types.ObjectId,
      ref: "Refund",
      default: null,
    },

    statusHistory: [StatusHistoryEntrySchema],

    confirmedAt: { type: Date },
    pickedUpAt: { type: Date },
    shippingAt: { type: Date },
    outForDeliveryAt: { type: Date },
    deliveredAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    deliveryFailedAt: { type: Date },
    returnWindowExpiresAt: { type: Date },
    buyerConfirmedAt: { type: Date },
    sellerReceivedAt: { type: Date },
    returningAt: { type: Date },
    returnedAt: { type: Date },
    refundRequestedAt: { type: Date },
    refundApprovedAt: { type: Date },
    refundedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: "orders",
  },
);

/* Danh sách theo người mua / người bán + lọc tab trạng thái */
OrderSchema.index({ buyerId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ sellerId: 1, status: 1, createdAt: -1 });

/* Lịch sử đơn khi không lọc status (vẫn hữu ích cho dashboard) */
OrderSchema.index({ buyerId: 1, createdAt: -1 });
OrderSchema.index({ sellerId: 1, createdAt: -1 });

OrderSchema.index({ status: 1 });
OrderSchema.index({ payoutStatus: 1 });

/* Admin: đơn completed chờ chi trả — sort theo completedAt */
OrderSchema.index({ status: 1, payoutStatus: 1, completedAt: 1 });

/* Seller: payout theo đơn completed */
OrderSchema.index({ sellerId: 1, status: 1, payoutStatus: 1, completedAt: -1 });

OrderSchema.index({ refundRequestId: 1 }, { sparse: true });

module.exports = mongoose.model("Order", OrderSchema);
