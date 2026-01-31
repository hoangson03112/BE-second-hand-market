const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const FileSchema = require("./File");

const BankInfoSchema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true,
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true,
  },
  bankName: {
    type: String,
    required: true,
  },
  accountNumber: {
    type: String,
    required: true,
  },
  accountHolder: {
    type: String,
    required: true,
  },
  proofImage: FileSchema,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("BankInfo", BankInfoSchema);
