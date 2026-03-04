const mongoose = require("mongoose");
const FileSchema = require("./File");
const Schema = mongoose.Schema;
const AccountSchema = new Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: false },
    googleId: { type: String, sparse: true, unique: true },
    fullName: { type: String, required: false },
    phoneNumber: { type: String },
    role: {
      type: String,
      enum: ["buyer", "seller", "admin"],
      default: "buyer",
    },
    status: { type: String, enum: ["active", "inactive"], default: "inactive" },
    lastLogin: { type: Date },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    verificationCode: { type: String },
    codeExpires: { type: Date },
    refreshToken: { type: String },
    refreshTokenExpires: { type: Date },
    refreshTokenAbsoluteExpires: { type: Date },
    avatar: FileSchema,
  },
  { timestamps: true, collection: "accounts" },
);

module.exports = mongoose.model("Account", AccountSchema);
