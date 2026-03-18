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
        "damaged", // Hàng bị hỏng
        "wrong_item", // Giao sai hàng
        "not_as_described", // Không đúng mô tả
        "missing_parts", // Thiếu phụ kiện
        "quality_issue", // Chất lượng không đạt
        "other", // Lý do khác
      ],
    },
    description: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    // Bằng chứng: ảnh/video của buyer khi mở hàng
    evidence: {
      images: { type: [FileSchema], default: [] }, // Ảnh sản phẩm lỗi
      videos: { type: [FileSchema], default: [] }, // Video unboxing
    },
    status: {
      type: String,
      default: "pending",
      enum: [
        "pending", // Chờ seller xét
        "approved", // Seller/admin chấp nhận hoàn
        "rejected", // Seller/admin từ chối
        "return_shipping", // Đã tạo đơn GHN hoàn (buyer -> seller)
        "returning", // Đang vận chuyển hoàn
        "returned", // Hàng hoàn về đến seller (GHN hoặc seller xác nhận)
        "bank_info_required", // Thiếu thông tin STK để admin hoàn
        "processing", // Admin đang xử lý hoàn tiền
        "completed", // Đã hoàn tiền xong
        "failed", // Hoàn tiền thất bại (cần xử lý lại)
        "disputed", // Tranh chấp (cần admin)
        "cancelled", // Buyer hủy
      ],
    },
    // Phản hồi từ seller
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
    // Admin can thiệp (nếu dispute)
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
    // Thông tin hoàn tiền
    refundAmount: {
      type: Number,
      required: true,
    },
    refundMethod: {
      type: String,
      enum: ["bank_transfer", "e_wallet", "cash"],
      default: "bank_transfer",
    },
    // Ngày hoàn tiền thực tế
    refundedAt: {
      type: Date,
    },
    // Buyer có thể escalate lên admin nếu không đồng ý với seller
    escalatedToAdmin: {
      type: Boolean,
      default: false,
    },
    escalatedAt: {
      type: Date,
    },
    // SLA deadlines
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
  }
);

// Index để tìm nhanh
RefundSchema.index({ orderId: 1 });
RefundSchema.index({ buyerId: 1, status: 1 });
RefundSchema.index({ sellerId: 1, status: 1 });
RefundSchema.index({ status: 1, createdAt: -1 });

// Check nếu order đã có refund request pending
RefundSchema.index(
  { orderId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["pending", "disputed"] },
    },
  }
);

module.exports = mongoose.model("Refund", RefundSchema);
