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
    status: {
      type: String,
      enum: ["active", "inactive", "banned"],
      default: "inactive",
    },
    lastLogin: { type: Date },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    verificationCode: { type: String },
    codeExpires: { type: Date },
    verificationCodeSentAt: { type: Date },
    verificationAttempts: { type: Number, default: 0 },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    refreshTokens: {
      type: [
        new Schema(
          {
            jti: { type: String, required: true },
            hash: { type: String, required: true },
            prevHash: { type: String },
            prevExpires: { type: Date },
            expires: { type: Date, required: true },
            absoluteExpires: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
      select: false,
    },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    avatar: FileSchema,
  },
  { timestamps: true, collection: "accounts" },
);

module.exports = mongoose.model("Account", AccountSchema);
