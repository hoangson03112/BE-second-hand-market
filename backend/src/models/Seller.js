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
    idCardFront: {
      type: FileSchema,
      required: true,
    },
    idCardBack: {
      type: FileSchema,
      required: true,
    },
    bankInfo: {
      bankName: { type: String, required: true },
      accountNumber: { type: String, required: true },
      accountHolder: { type: String, required: true },
    },
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "banned"],
      default: "pending",
    },

    agreeTerms: { type: Boolean, required: true },
    agreePolicy: { type: Boolean, required: true },
    approvedDate: { type: Date },
    rejectedReason: { type: String },
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
