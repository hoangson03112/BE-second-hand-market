const Message = require("../models/Message");

class ChatController {
  async getAllChat(req, res) {
    try {
      const messages = await Message.find({
        $or: [{ sender: req.accountID }, { receiver: req.accountID }],
      }).sort({ timestamp: -1 });

      if (!messages || messages.length === 0) {
        return res
          .status(404)
          .json({ message: "No messages found for this account." });
      }
      return res.status(200).json(messages);
    } catch (error) {
      console.error("Error retrieving messages: ", error);
      return res
        .status(500)
        .json({ message: "An error occurred while retrieving messages." });
    }
  }
}
module.exports = new ChatController();
