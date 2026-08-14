const mongoose = require("mongoose");
const FileSchema = require("./File");
const Schema = mongoose.Schema;

const RefundSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    buyerId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    reason: {
      type: String,
      required: true,
      enum: [
        "damaged",
        "wrong_item",
        "not_as_described",
        "missing_parts",
        "quality_issue",
        "other",
      ],
    },
    description: {
      type: String,
      required: true,
      maxlength: 1000,
    },

    evidence: {
      images: { type: [FileSchema], default: [] },
      videos: { type: [FileSchema], default: [] },
    },
    status: {
      type: String,
      default: "pending",
      enum: [
        "pending",
        "approved",
        "rejected",
        "return_shipping",
        "returning",
        "returned",
        "bank_info_required",
        "processing",
        "completed",
        "failed",
        "disputed",
        "cancelled",
      ],
    },

    sellerResponse: {
      decision: {
        type: String,
        enum: ["approved", "rejected"],
      },
      comment: {
        type: String,
        maxlength: 1000,
      },
      respondedAt: {
        type: Date,
      },
    },

    adminIntervention: {
      decision: {
        type: String,
        enum: ["refund", "reject"],
      },
      comment: {
        type: String,
        maxlength: 1000,
      },
      handledBy: {
        type: Schema.Types.ObjectId,
        ref: "Account",
      },
      handledAt: {
        type: Date,
      },
    },

    refundAmount: {
      type: Number,
      required: true,
    },
    refundMethod: {
      type: String,
      enum: ["bank_transfer", "e_wallet", "cash"],
      default: "bank_transfer",
    },

    refundedAt: {
      type: Date,
    },

    escalatedToAdmin: {
      type: Boolean,
      default: false,
    },
    escalatedAt: {
      type: Date,
    },

    sellerResponseDeadlineAt: {
      type: Date,
      default: null,
      index: true,
    },
    processingDeadlineAt: {
      type: Date,
      default: null,
      index: true,
    },
    autoEscalatedAt: {
      type: Date,
      default: null,
    },
    autoEscalationReason: {
      type: String,
      enum: ["SELLER_RESPONSE_TIMEOUT", "REFUND_PROCESSING_TIMEOUT", null],
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "refunds",
  },
);

RefundSchema.index({ orderId: 1 });
RefundSchema.index({ buyerId: 1, status: 1 });
RefundSchema.index({ sellerId: 1, status: 1 });
RefundSchema.index({ status: 1, createdAt: -1 });

RefundSchema.index(
  { orderId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["pending", "disputed"] },
    },
  },
);

module.exports = mongoose.model("Refund", RefundSchema);
