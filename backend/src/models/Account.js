const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const AccountSchema = new Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    fullName: { type: String, required: false },
    phoneNumber: { type: String },
    role: { type: String, enum: ["buyer", "seller", "admin", "staff"], default: "buyer" },
    status: { type: String, enum: ["active", "inactive"], default: "inactive" },
    lastLogin: { type: Date },
    isPhoneVerified: {
      type: Boolean,
      default: false
    },
    cart: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        quantity: { type: Number, required: true, default: 1 },
      },
    ],
    verificationCode: { type: String },
    codeExpires: { type: Date },
    addresses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Address",
      },
    ],
  },
  { timestamps: true, collection: "accounts" }
);

module.exports = mongoose.model("Account", AccountSchema);
