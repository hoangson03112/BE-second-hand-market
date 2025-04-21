const Message = require("../models/Message");
const Account = require("../models/Account");

class ChatController {
  async getConversation(req, res) {
    try {
      const { partnerId } = req.params;

      const messages = await Message.find({
        $or: [
          { sender: req.accountID, receiver: partnerId },
          { sender: partnerId, receiver: req.accountID },
        ],
      })
        .sort({ createdAt: 1 })
        .populate("sender", "name avatar")
        .populate("receiver", "name avatar");

      // Format messages to have consistent structure
      const formattedMessages = messages.map((message) => ({
        _id: message._id,
        text: message.text,
        senderId: message.sender._id,
        receiverId: message.receiver._id,
        senderName: message.sender.name,
        receiverName: message.receiver.name,
        senderAvatar: message.sender.avatar,
        receiverAvatar: message.receiver.avatar,
        createdAt: message.createdAt,
        isRead: message.isRead,
        attachments: message.attachments || [],
      }));

      res.json({
        success: true,
        data: formattedMessages,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
  async getChatPartners(req, res) {
    try {
      const userId = req.accountID; // ID của người dùng hiện tại

      // Tìm tất cả tin nhắn mà người dùng là sender hoặc receiver
      const messages = await Message.find({
        $or: [{ sender: userId }, { receiver: userId }],
      })
        .sort({ createdAt: -1 })
        .populate("sender receiver", "fullName avatar");

      // Tạo một Map để lưu trữ thông tin người chat cùng và tin nhắn cuối
      const partnersMap = new Map();

      // Đếm số tin nhắn chưa đọc từ mỗi người
      const unreadCountMap = new Map();

      messages.forEach((message) => {
        // Kiểm tra nếu sender hoặc receiver là null
        if (!message.sender || !message.receiver) {
          console.warn(
            "Skipping message with null sender or receiver:",
            message._id
          );
          return; // Skip this message
        }

        // Kiểm tra xem có IDs không trước khi so sánh
        if (!message.sender._id || !message.receiver._id) {
          console.warn("Skipping message with missing IDs:", message._id);
          return; // Skip this message
        }

        // Xác định người chat cùng (partner)
        const isUserSender =
          message.sender._id.toString() === userId.toString();
        const partnerId = isUserSender
          ? message.receiver._id
          : message.sender._id;

        const partnerIdString = partnerId.toString();

        const partner = isUserSender ? message.receiver : message.sender;

        // Đếm tin nhắn chưa đọc - kiểm tra null trước
        if (
          !message.isRead &&
          message.receiver._id.toString() === userId.toString()
        ) {
          const currentCount = unreadCountMap.get(partnerIdString) || 0;
          unreadCountMap.set(partnerIdString, currentCount + 1);
        }

        // Nếu chưa có trong Map hoặc tin nhắn mới hơn
        if (
          !partnersMap.has(partnerIdString) ||
          message.createdAt > partnersMap.get(partnerIdString).lastMessageAt
        ) {
          partnersMap.set(partnerIdString, {
            id: partnerId,
            name:
              partner.fullName ||
              partner.name ||
              partner.username ||
              "Unknown User", // Fallbacks
            avatar: partner.avatar || null,
            lastMessage: message.text || "",
            lastMessageAt: message.createdAt,
          });
        }
      });

      // Thêm số tin nhắn chưa đọc vào thông tin partners
      partnersMap.forEach((partner, id) => {
        partner.unread = unreadCountMap.get(id) || 0;
      });

      // Chuyển Map thành mảng và sắp xếp theo thời gian tin nhắn cuối
      const partners = Array.from(partnersMap.values()).sort((a, b) => {
        return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
      });

      res.status(200).json({
        success: true,
        data: partners,
      });
    } catch (error) {
      console.error("Error getting chat partners:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }
  async getChatHistory(req, res) {
    try {
      const receiverId = req.query.receiver;
      const senderId = req.accountID;

      // Validate input
      if (!receiverId || !senderId) {
        return res.status(400).json({
          success: false,
          message: "Missing receiver or sender ID",
        });
      }

      if (
        !mongoose.Types.ObjectId.isValid(receiverId) ||
        !mongoose.Types.ObjectId.isValid(senderId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID format",
        });
      }

      // Convert to ObjectId for query
      const senderObjectId = new mongoose.Types.ObjectId(senderId);
      const receiverObjectId = new mongoose.Types.ObjectId(receiverId);

      // Get chat history with pagination (example)
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const skip = (page - 1) * limit;

      const [messages, total] = await Promise.all([
        Message.find({
          $or: [
            { sender: senderObjectId, receiver: receiverObjectId },
            { sender: receiverObjectId, receiver: senderObjectId },
          ],
        })
          .sort({ createdAt: -1 }) // Newest first
          .skip(skip)
          .limit(limit)
          .populate("sender", "username avatar email")
          .populate("receiver", "username avatar email")
          .lean(), // Convert to plain JS object

        Message.countDocuments({
          $or: [
            { sender: senderObjectId, receiver: receiverObjectId },
            { sender: receiverObjectId, receiver: senderObjectId },
          ],
        }),
      ]);

      const formattedMessages = messages
        .map((msg) => {
          const isMe = msg.sender._id.equals(senderObjectId);
          return {
            id: msg._id,
            content: msg.text,
            timestamp: msg.createdAt,
            isRead: msg.read,
            isMe,
            sender: {
              id: msg.sender._id,
              name: msg.sender.username,
              avatar: msg.sender.avatar,
              email: msg.sender.email,
            },
            receiver: {
              id: msg.receiver._id,
              name: msg.receiver.username,
              avatar: msg.receiver.avatar,
              email: msg.receiver.email,
            },
            // Additional metadata if needed
            type: msg.type || "text", // For multimedia messages
          };
        })
        .reverse(); // Reverse to show oldest first

      // Mark messages as read
      const unreadMessages = messages.filter(
        (msg) => !msg.read && msg.receiver._id.equals(senderObjectId)
      );

      if (unreadMessages.length > 0) {
        await Message.updateMany(
          {
            _id: { $in: unreadMessages.map((msg) => msg._id) },
            receiver: senderObjectId,
          },
          { $set: { read: true, readAt: new Date() } }
        );
      }

      res.status(200).json({
        success: true,
        data: {
          messages: formattedMessages,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching chat history:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
  async sendFileMessage(req, res) {
    try {
      const { receiverId, file, type } = req.body;
      const senderId = req.accountID;

      // Validate input
      if (!receiverId || !file || !type) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }
      const message = new Message({
        sender: senderId,
        receiver: receiverId,
        text: "",
        attachments: [{ type: file.type, url: file.url }],
      });

      await message.save();

      res.status(200).json({
        success: true,
        message: "File message sent successfully",
      });
    } catch (error) {
      console.error("Error sending file message:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  /**
   * Upload files to Cloudinary and send a message with the attachments
   * @route POST /chat/upload-and-send
   */
  async uploadAndSendMessage(req, res) {
    try {
      // Extract data from request
      const { receiverId, text, tempMsgId } = req.body;
      const senderId = req.accountID;
      const files = req.files; // Should be processed by multer middleware

      console.log("Received upload request:", {
        receiverId,
        text,
        files: files?.length,
      });

      // Validate input
      if (
        !receiverId ||
        !files ||
        !Array.isArray(files) ||
        files.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      // Configure Cloudinary
      const cloudinary = require("cloudinary").v2;
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });

      // Upload each file to Cloudinary
      const uploadPromises = files.map((file) => {
        return new Promise((resolve, reject) => {
          // Create a stream for uploading
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: "Chat",
              resource_type: "auto",
            },
            (error, result) => {
              if (error) {
                console.error("Error uploading to Cloudinary:", error);
                reject(error);
              } else {
                // Return file information with Cloudinary URL
                resolve({
                  type: file.mimetype,
                  name: file.originalname,
                  url: result.secure_url,
                  publicId: result.public_id,
                  size: file.size,
                });
              }
            }
          );

          // Pass the file buffer to the upload stream
          const bufferStream = require("stream").Readable.from(file.buffer);
          bufferStream.pipe(uploadStream);
        });
      });

      // Wait for all files to be uploaded
      const uploadedAttachments = await Promise.all(uploadPromises);

      // Create message in database
      const message = new Message({
        sender: senderId,
        receiver: receiverId,
        text: text || "",
        attachments: uploadedAttachments.map((attachment) => ({
          type: attachment.type,
          name: attachment.name,
          url: attachment.url,
          publicId: attachment.publicId,
          size: attachment.size,
        })),
      });

      await message.save();

      // Get sender and receiver information for the response
      const sender = await Account.findById(senderId).select(
        "firstName lastName avatar"
      );
      const receiver = await Account.findById(receiverId).select(
        "firstName lastName avatar"
      );

      // Format message for socket.io and response
      const formattedMessage = {
        _id: message._id,
        senderId: senderId,
        receiverId: receiverId,
        text: message.text,
        attachments: message.attachments,
        createdAt: message.createdAt,
        isRead: message.isRead,
        senderName: sender
          ? `${sender.firstName} ${sender.lastName}`
          : "Unknown",
        senderAvatar: sender ? sender.avatar : null,
        tempMsgId: tempMsgId, // Include the temporary ID for frontend matching
      };

      // Emit socket event to notify clients
      const io = req.app.get("io");
      if (io) {
        io.to(receiverId).emit("receive-message", formattedMessage);
        io.to(senderId).emit("message-sent", formattedMessage);
      } else {
        console.warn("Socket.io instance not found on request object");
      }

      res.status(200).json({
        success: true,
        message: "Files uploaded and message sent successfully",
        data: formattedMessage,
      });
    } catch (error) {
      console.error("Error uploading files and sending message:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }
}

module.exports = new ChatController();
