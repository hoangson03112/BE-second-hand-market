const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Account" }]

  },
  { collection: "conversations", timestamps: true }
);


conversationSchema.index({ participants: 1 });

const Conversation = mongoose.model("Conversation", conversationSchema);

module.exports = Conversation;