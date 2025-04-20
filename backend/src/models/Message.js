const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const messageSchema = new Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    text: String,
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "messages" }
);

module.exports = mongoose.model("Message", messageSchema);
