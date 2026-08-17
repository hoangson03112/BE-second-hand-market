const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const FileSchema = require("./File");




const BankInfoSchema = new Schema(
  {

    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true
    },


    type: {
      type: String,
      enum: ["payment_proof", "refund_account"],
      default: "payment_proof"
    },


    sellerBankSnapshot: {
      bankName: { type: String },
      accountNumber: { type: String },
      accountHolder: { type: String }
    },


    proofImage: { type: FileSchema },


    transferredAt: { type: Date },


    buyerBankName: { type: String, trim: true },
    buyerAccountNumber: { type: String, trim: true },
    buyerAccountHolder: { type: String, trim: true },
    submittedAt: { type: Date },


    status: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending"
    },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Account", default: null },
    verifiedAt: { type: Date, default: null },
    rejectReason: { type: String, default: null }
  },
  {
    timestamps: true,
    collection: "bank_infos"
  }
);


BankInfoSchema.index({ orderId: 1, type: 1 }, { unique: true });
BankInfoSchema.index({ buyerId: 1, createdAt: -1 });
BankInfoSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("BankInfo", BankInfoSchema);