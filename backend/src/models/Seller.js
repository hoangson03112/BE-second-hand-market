const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const FileSchema = require("./File");

const SellerSchema = new Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
    },

    // --- Xác minh danh tính (CMND/CCCD) ---
    idCardFront: {
      type: FileSchema,
      required: true,
    },
    idCardBack: {
      type: FileSchema,
      required: true,
    },
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectedReason: { type: String },
    approvedDate: { type: Date },
    // Admin nào đã duyệt/từ chối
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },

    // --- Tài khoản ngân hàng nhận tiền từ buyer ---
    // Embed vì C2C cá nhân — thường chỉ 1 tài khoản
    bankInfo: {
      bankName: { type: String, required: true },
      accountNumber: { type: String, required: true },
      accountHolder: { type: String, required: true },
      // Mã BIN ngân hàng để generate QR VietQR tự động
      // VD: VPBank=970432, Vietcombank=970436, Techcombank=970407
      bankBin: { type: String, default: null },
    },

    // --- Stats cá nhân (denormalized, cập nhật bằng hook/cron) ---
    // Tránh aggregate liên tục khi hiển thị profile seller
    stats: {
      totalProductsActive: { type: Number, default: 0 },
      totalSold: { type: Number, default: 0 },
      avgRating: { type: Number, default: 0 },
      totalReviews: { type: Number, default: 0 },
    },

    agreeTerms: { type: Boolean, required: true },
    agreePolicy: { type: Boolean, required: true },
  },
  {
    timestamps: true,
    collection: "sellers",
  },
);

// accountId đã có unique index từ field definition
SellerSchema.index({ verificationStatus: 1 });
SellerSchema.index({ "bankInfo.accountNumber": 1 });

module.exports = mongoose.model("Seller", SellerSchema);
