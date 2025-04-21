const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MediaAttachmentSchema = new mongoose.Schema({
  type: {
    type: String,
  },
  name: {
    type: String,
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  publicId: {
    type: String,
    required: true,
  },
  size: {
    type: Number, // Kích thước tệp (bytes)
    default: 0,
  },
  signedUrl: {
    type: String, // URL có chữ ký (nếu dùng bảo mật)
    default: "",
  },
  signedUrlExpiresAt: {
    type: Date, // Thời gian hết hạn của signed URL
  },
});

const messageSchema = new Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    text: {
      type: String,
      default: "",
    },
    attachments: [MediaAttachmentSchema],
    isRead: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true, // Tăng tốc sắp xếp theo thời gian
    },
  },
  { collection: "messages" }
);

messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
