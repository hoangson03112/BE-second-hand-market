const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const FileSchema = require("./File");

// Model này lưu bằng chứng chuyển khoản của BUYER cho mỗi đơn hàng
const BankInfoSchema = new Schema(
  {
    // Buyer thực hiện chuyển khoản
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true, // 1 order chỉ có 1 proof
    },

    // Snapshot thông tin ngân hàng của seller tại thời điểm CK
    // Lưu riêng để audit trail — seller có thể đổi bank info sau
    sellerBankSnapshot: {
      bankName:      { type: String, required: true },
      accountNumber: { type: String, required: true },
      accountHolder: { type: String, required: true },
    },

    // Ảnh chụp màn hình / biên lai chuyển khoản
    proofImage: { type: FileSchema, required: true },

    // Thời điểm buyer thực hiện chuyển khoản (buyer tự nhập)
    transferredAt: { type: Date },

    // --- Trạng thái xác minh (admin verify) ---
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

// orderId đã có unique index từ field definition
BankInfoSchema.index({ buyerId: 1, createdAt: -1 });
BankInfoSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("BankInfo", BankInfoSchema);
