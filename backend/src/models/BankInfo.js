const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const FileSchema = require("./File");

// Model này lưu:
//   1. Bằng chứng chuyển khoản của BUYER cho mỗi đơn hàng (type = "payment_proof")
//   2. STK ngân hàng của BUYER để nhận tiền hoàn (type = "refund_account")
const BankInfoSchema = new Schema(
  {
    // Buyer thực hiện chuyển khoản / cung cấp STK hoàn tiền
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },

    // Phân biệt mục đích sử dụng
    type: {
      type: String,
      enum: ["payment_proof", "refund_account"],
      default: "payment_proof",
    },

    // ── payment_proof: Snapshot thông tin ngân hàng của seller tại thời điểm CK ──
    sellerBankSnapshot: {
      bankName:      { type: String },
      accountNumber: { type: String },
      accountHolder: { type: String },
    },

    // ── payment_proof: Ảnh chụp màn hình / biên lai chuyển khoản ──
    proofImage: { type: FileSchema },

    // ── payment_proof: Thời điểm buyer thực hiện chuyển khoản ──
    transferredAt: { type: Date },

    // ── refund_account: STK của buyer để nhận tiền hoàn ──
    buyerBankName:      { type: String, trim: true },
    buyerAccountNumber: { type: String, trim: true },
    buyerAccountHolder: { type: String, trim: true },
    submittedAt:        { type: Date },

    // --- Trạng thái xác minh (admin verify — chỉ áp dụng cho payment_proof) ---
    status: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },
    verifiedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "Account", default: null },
    verifiedAt:   { type: Date, default: null },
    rejectReason: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: "bank_infos",
  }
);

// orderId + type là unique per document
BankInfoSchema.index({ orderId: 1, type: 1 }, { unique: true });
BankInfoSchema.index({ buyerId: 1, createdAt: -1 });
BankInfoSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("BankInfo", BankInfoSchema);
