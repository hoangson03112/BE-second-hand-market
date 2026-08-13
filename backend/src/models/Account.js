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
      default: "buyer"
    },
    status: { type: String, enum: ["active", "inactive", "banned"], default: "inactive" },
    lastLogin: { type: Date },
    isPhoneVerified: {
      type: Boolean,
      default: false
    },
    verificationCode: { type: String },
    codeExpires: { type: Date },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    // Chỉ lưu HASH của refresh token: DB bị lộ cũng không mạo danh được ai.
    // select:false để không endpoint nào lỡ trả nó ra ngoài.
    refreshTokenHash: { type: String, select: false },
    refreshTokenExpires: { type: Date },
    refreshTokenAbsoluteExpires: { type: Date },
    // Token vừa bị xoay vòng, còn được chấp nhận trong cửa sổ ân hạn ngắn để
    // nhiều tab refresh đồng thời không đá nhau ra khỏi phiên.
    previousRefreshTokenHash: { type: String, select: false },
    previousRefreshTokenExpires: { type: Date },
    // Chống brute-force mật khẩu ở mức tài khoản (bổ sung cho rate limit theo IP).
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    avatar: FileSchema
  },
  { timestamps: true, collection: "accounts" }
);

module.exports = mongoose.model("Account", AccountSchema);