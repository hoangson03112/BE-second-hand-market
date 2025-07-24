const mongoose = require("mongoose");
const FileSchema = require("./File");

const ReportSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["order", "product", "system", "other"],
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
      required: true,
    },
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
