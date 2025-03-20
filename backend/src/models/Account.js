const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const AccountSchema = new Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    fullName: { type: String, required: false },
    phoneNumber: { type: String },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    status: { type: String, enum: ["active", "inactive"], default: "inactive" },
    avatar: { type: String, required: false },
    lastLogin: { type: Date },
    cart: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        quantity: { type: Number, required: true, default: 1 },
      },
    ],
    verificationCode: { type: String },
    codeExpires: { type: Date },
    address: {
      province: { type: String },
      district: { type: String },
      ward: { type: String },
      specificAddress: { type: String },
    },
  },
  { timestamps: true, collection: "accounts" }
);

module.exports = mongoose.model("Account", AccountSchema);
