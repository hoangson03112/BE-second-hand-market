const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MediaSchema = new mongoose.Schema({
  type: {
    type: String,
  },
  url: {
    type: String,
    required: true,
  },
  publicId: {
    type: String,
  },
  name: {
    type: String,
  },
  size: {
    type: Number,
  },
});

const messageSchema = new Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    type: {
      type: String,
      required: true,
      enum: ["text", "image", "video", "product", "order"],
      default: "text",
    },
    text: {
      type: String,
      default: "",
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    media: [MediaSchema],
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
  },
  { collection: "messages", timestamps: true }
);

// Add compound index for faster queries
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, status: 1 });

module.exports = mongoose.model("Message", messageSchema);
