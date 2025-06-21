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
    // Thông tin địa chỉ
    businessAddress: { type: String, required: true },
    province: { type: String, required: true },
    district: { type: String, required: true },
    ward: { type: String, required: true },
    idCardFront: {
      type: FileSchema,
      required: true,
    },
    idCardBack: {
      type: FileSchema,
      required: true,
    },

    // Thông tin ngân hàng
    bankInfo: {
      bankName: { type: String, required: true },
      accountNumber: { type: String, required: true },
      accountHolder: { type: String, required: true },
    },

    // Trạng thái duyệt
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    // Điều khoản
    agreeTerms: { type: Boolean, required: true },
    agreePolicy: { type: Boolean, required: true },

    // Thông tin duyệt
    approvedDate: { type: Date },
    rejectedReason: { type: String },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
  },
  {
    timestamps: true,
    collection: "sellers",
  }
);

SellerSchema.index({ accountId: 1 });
SellerSchema.index({ verificationStatus: 1 });
SellerSchema.index({ "bankInfo.accountNumber": 1 });
SellerSchema.index({ "idCardFront.publicId": 1 });
SellerSchema.index({ "idCardBack.publicId": 1 });

module.exports = mongoose.model("Seller", SellerSchema);
