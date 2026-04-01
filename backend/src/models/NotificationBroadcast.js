const mongoose = require("mongoose");

const NotificationBroadcastSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    link: { type: String, default: "" },
    targetRoles: [{ type: String, enum: ["buyer", "seller", "admin"] }],
    sentCount: { type: Number, default: 0 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

NotificationBroadcastSchema.index({ createdAt: -1 });

module.exports = mongoose.model("NotificationBroadcast", NotificationBroadcastSchema);

