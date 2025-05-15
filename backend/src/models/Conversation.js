const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Account", index: true },
    ],
  },
  { collection: "conversations", timestamps: true }
);

// Create compound index for participants to efficiently find conversations between two users
conversationSchema.index({ participants: 1 });

const Conversation = mongoose.model("Conversation", conversationSchema);

module.exports = Conversation;
