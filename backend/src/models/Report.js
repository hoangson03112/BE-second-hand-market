const mongoose = require("mongoose");
const FileSchema = require("./File");

const ReportSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["order", "product", "system", "other", "account_appeal"],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "targetModel",
    },
    targetModel: {
      type: String,
      enum: ["Order", "Product"],
    },
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: false, // null khi type = account_appeal (user bị khóa gửi khiếu nại)
    },
    reporterEmail: { type: String },   // dùng cho account_appeal khi không có reporterId
    reporterFullName: { type: String },
    images: { type: [FileSchema], default: [] },
    description: { type: String },
    status: {
      type: String,
      enum: ["pending", "processing", "resolved", "rejected"],
      default: "pending",
    },
    result: { type: String },
  },
  { timestamps: true }
);

const Report = mongoose.model("Report", ReportSchema);

module.exports = Report;
