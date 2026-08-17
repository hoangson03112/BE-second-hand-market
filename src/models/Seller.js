const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const FileSchema = require("./File");

const SellerSchema = new Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true
    },


    idCardFront: {
      type: FileSchema,
      required: true
    },
    idCardBack: {
      type: FileSchema,
      required: true
    },
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    rejectedReason: { type: String },
    approvedDate: { type: Date },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null
    },



    bankInfo: {
      bankName: { type: String, required: true },
      accountNumber: { type: String, required: true },
      accountHolder: { type: String, required: true },


      bankBin: { type: String, default: null }
    },



    stats: {
      totalProductsActive: { type: Number, default: 0 },
      totalSold: { type: Number, default: 0 },
      avgRating: { type: Number, default: 0 },
      totalReviews: { type: Number, default: 0 }
    },

    agreeTerms: { type: Boolean, required: true },
    agreePolicy: { type: Boolean, required: true }
  },
  {
    timestamps: true,
    collection: "sellers"
  }
);


SellerSchema.index({ verificationStatus: 1 });
SellerSchema.index({ "bankInfo.accountNumber": 1 });

module.exports = mongoose.model("Seller", SellerSchema);