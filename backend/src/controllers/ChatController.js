const Message = require("../models/Message");
const Account = require("../models/Account");
const Conversation = require("../models/Conversation");
const mongoose = require("mongoose");

// Helper function to create ObjectId safely
const createObjectId = (id) => {
  if (!id) return null;
  return mongoose.Types.ObjectId.createFromHexString(id);
};

class ChatController {
  async getConversation(req, res) {
    try {
      const { partnerId } = req.params;

      if (
        !mongoose.Types.ObjectId.isValid(partnerId) ||
        !mongoose.Types.ObjectId.isValid(req.accountID)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format",
        });
      }

      const userObjectId = createObjectId(req.accountID);
      const partnerObjectId = createObjectId(partnerId);

      // Find or create conversation
      let conversation = await Conversation.findOne({
        participants: { $all: [userObjectId, partnerObjectId] },
      });

      if (!conversation) {
        // Create new conversation
        conversation = new Conversation({
          participants: [userObjectId, partnerObjectId],
        });
        await conversation.save();

        return res.json({
          success: true,
          data: [],
          conversationId: conversation._id,
        });
      }

      // Find messages with full details
      const messages = await Message.find({
        conversationId: conversation._id,
      })
        .sort({ createdAt: 1 })
        .populate("senderId", "name avatar")
        .populate("productId")
        .populate("orderId")
        .lean();

      // Format messages to have consistent structure
      const formattedMessages = messages.map((message) => {
        // Prepare product data if exists
        let productData = null;
        if (message.type === "product" && message.productId) {
          productData = {
            id: message.productId._id,
            name: message.productId.name,
            price: message.productId.price,
            image:
              message.productId.images && message.productId.images.length > 0
                ? message.productId.images[0]
                : null,
          };
        }

        // Prepare order data if exists
        let orderData = null;
        if (message.type === "order" && message.orderId) {
          orderData = {
            id: message.orderId._id,
            orderNumber: message.orderId.orderNumber,
            total: message.orderId.total,
            status: message.orderId.status,
          };
        }

        return {
          _id: message._id,
          text: message.text || "",
          senderId: message.senderId._id,
          senderName: message.senderId.name,
          senderAvatar: message.senderId.avatar,
          type: message.type,
          media: message.media || [],
          status: message.status,
          createdAt: message.createdAt,
          product: productData,
          order: orderData,
        };
      });

      // Mark messages as read
      await Message.updateMany(
        {
          conversationId: conversation._id,
          senderId: partnerObjectId,
          status: { $ne: "read" },
        },
        { $set: { status: "read" } }
      );

      // Get partner info
      const partner = await Account.findById(partnerObjectId).select(
        "name fullName avatar"
      );

      res.json({
        success: true,
        data: formattedMessages,
        conversationId: conversation._id,
        partner: {
          id: partner._id,
          name: partner.fullName || partner.name || "Unknown",
          avatar: partner.avatar,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
  async getConversationsList(req, res) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.accountID)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format",
        });
      }

      const userId = createObjectId(req.accountID);
      console.log("Getting conversations for user:", userId);

      // Bước 1: Tìm tất cả cuộc trò chuyện mà người dùng tham gia
      const conversations = await Conversation.aggregate([
        {
          $match: {
            participants: userId,
          },
        },
        // Bước 2: Lookup thông tin người tham gia
        {
          $lookup: {
            from: "accounts",
            localField: "participants",
            foreignField: "_id",
            as: "participantDetails",
          },
        },
        // Bước 3: Định dạng thông tin cuộc trò chuyện
        {
          $project: {
            _id: 1,
            participants: "$participantDetails",
            updatedAt: 1,
            createdAt: 1,
          },
        },
      ]);

      // Lấy danh sách ID cuộc trò chuyện
      const conversationIds = conversations.map((conv) => conv._id);

      // Bước 4: Lấy tin nhắn cuối cùng cho mỗi cuộc trò chuyện
      const lastMessages = await Message.aggregate([
        {
          $match: {
            conversationId: { $in: conversationIds },
          },
        },
        // Nhóm theo cuộc trò chuyện và lấy tin nhắn mới nhất
        {
          $sort: { createdAt: -1 },
        },
        {
          $group: {
            _id: "$conversationId",
            lastMessage: { $first: "$$ROOT" },
          },
        },
      ]);

      // Bước 5: Đếm số tin nhắn chưa đọc cho mỗi cuộc trò chuyện
      const unreadCounts = await Message.aggregate([
        {
          $match: {
            conversationId: { $in: conversationIds },
            senderId: { $ne: userId },
            status: "sent",
          },
        },
        {
          $group: {
            _id: "$conversationId",
            count: { $sum: 1 },
          },
        },
      ]);

      // Tạo bản đồ cho tin nhắn cuối cùng và số lượng chưa đọc
      const lastMessageMap = {};
      lastMessages.forEach((item) => {
        lastMessageMap[item._id.toString()] = item.lastMessage;
      });

      const unreadCountMap = {};
      unreadCounts.forEach((item) => {
        unreadCountMap[item._id.toString()] = item.count;
      });

      // Định dạng lại dữ liệu cho frontend
      const formattedConversations = conversations.map((conv) => {
        const convId = conv._id.toString();
        // Tìm người trò chuyện (không phải người dùng hiện tại)
        const partner =
          conv.participants.find(
            (p) => p._id.toString() !== userId.toString()
          ) || {};

        const lastMsg = lastMessageMap[convId] || {};

        // Xác định loại tin nhắn và nội dung hiển thị
        let displayText = lastMsg.text || "";
        let messageType = lastMsg.type || "";

        // Chuẩn bị mô tả tin nhắn dựa trên loại
        if (lastMsg.type === "image") {
          displayText = displayText || "Đã gửi một hình ảnh";
        } else if (lastMsg.type === "video") {
          displayText = displayText || "Đã gửi một video";
        } else if (lastMsg.type === "product") {
          displayText = displayText || "Đã gửi thông tin sản phẩm";
        } else if (lastMsg.type === "order") {
          displayText = displayText || "Đã gửi thông tin đơn hàng";
        }

        return {
          _id: partner._id,
          name: partner.fullName || partner.name || "Unknown User",
          avatar: partner.avatar || null,
          lastMessage: displayText,
          lastMessageType: messageType,
          lastMessageSenderId: lastMsg.senderId || null,
          lastMessageAt: lastMsg.createdAt || conv.updatedAt,
          unread: unreadCountMap[convId] || 0,
          conversationId: conv._id,
        };
      });

      // Lọc bỏ các cuộc trò chuyện không có đối tác hợp lệ
      const validConversations = formattedConversations.filter(
        (conv) => conv._id
      );

      validConversations.sort((a, b) => {
        const timeA = new Date(a.lastMessageAt || 0);
        const timeB = new Date(b.lastMessageAt || 0);
        return timeB - timeA;
      });

      res.status(200).json({
        success: true,
        data: validConversations,
      });
    } catch (error) {
      console.error("Error getting chat conversations:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  async uploadAndSendMessage(req, res) {
    try {
      const { currentConversationId, tempMsgId, receiverId, text } = req.body;
      const senderId = req.accountID;
      const files = req.files;

      if (
        !currentConversationId ||
        !files ||
        !Array.isArray(files) ||
        files.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      if (
        !mongoose.Types.ObjectId.isValid(senderId) ||
        !mongoose.Types.ObjectId.isValid(receiverId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID format",
        });
      }

      const senderObjectId = createObjectId(senderId);
      const receiverObjectId = createObjectId(receiverId);
      let conversation = await Conversation.findOne({
        _id: currentConversationId,
      });

      if (!conversation) {
        // Create new conversation
        conversation = new Conversation({
          participants: [senderObjectId, receiverObjectId],
        });
        await conversation.save();
      } else {
        await Conversation.findByIdAndUpdate(conversation._id, {
          $currentDate: { updatedAt: true },
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
      const uploadedMedia = await Promise.all(uploadPromises);

      // Determine message type based on media type
      let messageType = "text";
      if (uploadedMedia.length > 0) {
        const firstMediaType = uploadedMedia[0].type;
        if (firstMediaType.startsWith("image/")) {
          messageType = "image";
        } else if (firstMediaType.startsWith("video/")) {
          messageType = "video";
        }
      }
      if (text.trim() !== "") {
        const newMessageText = new Message({
          conversationId: conversation._id,
          senderId: senderObjectId,
          type: messageType,
          text: text,
        });
        await newMessageText.save();
      }
      const newMessage = new Message({
        conversationId: conversation._id,
        senderId: senderObjectId,
        type: messageType,
        media: uploadedMedia,
      });

      await newMessage.save();
      // Get sender info for response
      const sender = await Account.findById(senderId).select(
        "name avatar fullName"
      );

      const formattedMessage = {
        _id: newMessage._id,
        senderId: senderId,
        text: newMessage.text,
        status: newMessage.status,
        media: newMessage.media,
        type: newMessage.type,
        senderName: sender ? sender.fullName || sender.name : "Unknown",
        senderAvatar: sender ? sender.avatar : null,
        createdAt: newMessage.createdAt,
        conversationId: conversation._id,
        tempMsgId: tempMsgId,
      };

      // Emit real-time updates
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
  async findOrCreateConversationWithProduct(req, res) {
    try {
      const { productId, sellerId } = req.body;
      const userId = req.accountID;

      // Validate ObjectId format
      if (
        !mongoose.Types.ObjectId.isValid(userId) ||
        !mongoose.Types.ObjectId.isValid(sellerId) ||
        !mongoose.Types.ObjectId.isValid(productId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID format",
        });
      }

      // Find existing conversation
      const userObjectId = createObjectId(userId);
      const sellerObjectId = createObjectId(sellerId);

      let conversation = await Conversation.findOne({
        participants: { $all: [userObjectId, sellerObjectId] },
      });

      // Create new conversation if it doesn't exist
      if (!conversation) {
        const newConversation = new Conversation({
          participants: [userObjectId, sellerObjectId],
        });
        conversation = await newConversation.save();

        await message.save();
      } else {
        await Conversation.findByIdAndUpdate(conversation._id, {
          $currentDate: { updatedAt: true },
        });
      }

      const message = new Message({
        conversationId: conversation._id,
        senderId: userObjectId,
        type: "product",
        productId: createObjectId(productId),
        status: "sent",
      });
      await message.save();
      // Get partner (seller) information
      const partner = await Account.findById(sellerObjectId).select(
        "name fullName avatar"
      );

      res.status(200).json({
        success: true,
        message: "Conversation created or found successfully",
        data: {
          conversationId: conversation._id,
        },
        partner: {
          _id: partner._id,
          name: partner.fullName || partner.name || "Unknown",
          avatar: partner.avatar || null,
        },
      });
    } catch (error) {
      console.error("Error creating product conversation:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }
  async findOrCreateConversationWithOrder(req, res) {
    try {
      const { orderId, sellerId } = req.body;
      const userId = req.accountID;

      if (
        !mongoose.Types.ObjectId.isValid(userId) ||
        !mongoose.Types.ObjectId.isValid(sellerId) ||
        !mongoose.Types.ObjectId.isValid(orderId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID format",
        });
      }
      const userObjectId = createObjectId(userId);
      const sellerObjectId = createObjectId(sellerId);
      const orderObjectId = createObjectId(orderId);

      let conversation = await Conversation.findOne({
        participants: { $all: [userObjectId, sellerObjectId] },
      });

      if (!conversation) {
        const newConversation = new Conversation({
          participants: [userObjectId, sellerObjectId],
        });
        conversation = await newConversation.save();
      } else {
        await Conversation.findByIdAndUpdate(conversation._id, {
          $currentDate: { updatedAt: true },
        });
      }
      const message = new Message({
        conversationId: conversation._id,
        senderId: userObjectId,
        type: "order",
        orderId: orderObjectId,
      });
      await message.save();

      const partner = await Account.findById(sellerObjectId).select(
        "name fullName avatar"
      );

      res.status(200).json({
        success: true,
        message: "Conversation created or found successfully",
        data: {
          conversationId: conversation._id,
        },
        partner: {
          _id: partner._id,
          name: partner.fullName || partner.name || "Unknown",
          avatar: partner.avatar || null,
        },
      });
    } catch (error) {
      console.error("Error creating order conversation:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }
  async getOptimizedConversation(req, res) {
    try {
      const { partnerId } = req.params;
      const userId = req.accountID;

      if (
        !mongoose.Types.ObjectId.isValid(partnerId) ||
        !mongoose.Types.ObjectId.isValid(userId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format",
        });
      }

      // Convert IDs to ObjectId
      const userObjectId = createObjectId(userId);
      const partnerObjectId = createObjectId(partnerId);

      // Find or create conversation between the two users
      let conversation = await Conversation.findOne({
        participants: { $all: [userObjectId, partnerObjectId] },
      });

      if (!conversation) {
        // Create new conversation if it doesn't exist
        conversation = new Conversation({
          participants: [userObjectId, partnerObjectId],
        });
        await conversation.save();

        return res.json({
          success: true,
          data: [],
          conversationId: conversation._id,
        });
      }

      // Get messages with pagination (50 messages per page)
      const page = parseInt(req.query.page) || 0;
      const limit = parseInt(req.query.limit) || 50;

      // Tìm tin nhắn với thông tin đầy đủ
      const messages = await Message.find({
        conversationId: conversation._id,
      })
        .sort({ createdAt: -1 }) // Newest first
        .skip(page * limit)
        .limit(limit)
        .populate("senderId", "name avatar") // Thông tin người gửi
        .populate("productId") // Thông tin sản phẩm
        .populate("orderId") // Thông tin đơn hàng
        .lean(); // Use lean() for better performance

      // Format and reverse messages to show in chronological order
      const formattedMessages = messages
        .map((message) => {
          // Chuẩn bị dữ liệu sản phẩm (nếu có)
          let productData = null;
          if (message.type === "product" && message.productId) {
            productData = {
              id: message.productId._id,
              name: message.productId.name,
              price: message.productId.price,
              image:
                message.productId.images && message.productId.images.length > 0
                  ? message.productId.images[0]
                  : null,
              // Các thông tin khác của sản phẩm
            };
          }

          // Chuẩn bị dữ liệu đơn hàng (nếu có)
          let orderData = null;
          if (message.type === "order" && message.orderId) {
            orderData = {
              id: message.orderId._id,
              orderNumber: message.orderId.orderNumber,
              total: message.orderId.total,
              status: message.orderId.status,
              // Các thông tin khác của đơn hàng
            };
          }

          return {
            _id: message._id,
            text: message.text || "",
            senderId: message.senderId._id,
            senderName: message.senderId.name,
            senderAvatar: message.senderId.avatar,
            type: message.type,
            media: message.media || [],
            status: message.status,
            createdAt: message.createdAt,
            product: productData,
            order: orderData,
          };
        })
        .reverse(); // Reverse to get chronological order

      // Mark unread messages as read
      if (formattedMessages.length > 0) {
        await Message.updateMany(
          {
            conversationId: conversation._id,
            senderId: partnerObjectId,
            status: { $ne: "read" },
          },
          { $set: { status: "read" } }
        );
      }

      // Get total message count for pagination info
      const totalMessages = await Message.countDocuments({
        conversationId: conversation._id,
      });

      // Lấy thông tin người chat
      const partner = await Account.findById(partnerObjectId).select(
        "name fullName avatar"
      );

      res.json({
        success: true,
        data: formattedMessages,
        pagination: {
          page,
          limit,
          totalMessages,
          hasMore: totalMessages > (page + 1) * limit,
        },
        conversationId: conversation._id,
        partner: {
          id: partner._id,
          name: partner.fullName || partner.name || "Unknown",
          avatar: partner.avatar,
        },
      });
    } catch (error) {
      console.error("Error getting conversation:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async sendMessage(req, res) {
    try {
      const {
        conversationId,
        text,
        type = "text",
        productId,
        orderId,
      } = req.body;
      const senderId = req.accountID;

      // Validate required fields
      if (!conversationId || (!text && type === "text")) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      // Validate ObjectId format
      if (
        !mongoose.Types.ObjectId.isValid(conversationId) ||
        !mongoose.Types.ObjectId.isValid(senderId) ||
        (productId && !mongoose.Types.ObjectId.isValid(productId)) ||
        (orderId && !mongoose.Types.ObjectId.isValid(orderId))
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID format",
        });
      }

      // Create and save message
      const message = new Message({
        conversationId,
        senderId,
        type,
        text: text || "",
        productId:
          type === "product" && productId
            ? createObjectId(productId)
            : undefined,
        orderId:
          type === "order" && orderId ? createObjectId(orderId) : undefined,
        status: "sent",
      });

      await message.save();

      // Update conversation's updatedAt timestamp
      await Conversation.findByIdAndUpdate(conversationId, {
        $currentDate: { updatedAt: true },
      });

      // Get sender info for response
      const sender = await Account.findById(senderId).select(
        "name avatar fullName"
      );

      // Populate product or order data if needed
      let populatedMessage = message;
      if (type === "product" && productId) {
        populatedMessage = await Message.findById(message._id)
          .populate("productId")
          .lean();
      } else if (type === "order" && orderId) {
        populatedMessage = await Message.findById(message._id)
          .populate("orderId")
          .lean();
      }

      // Prepare product data if applicable
      let productData = null;
      if (type === "product" && populatedMessage.productId) {
        const product = populatedMessage.productId;
        productData = {
          id: product._id,
          name: product.name,
          price: product.price,
          image:
            product.images && product.images.length > 0
              ? product.images[0]
              : null,
        };
      }

      // Prepare order data if applicable
      let orderData = null;
      if (type === "order" && populatedMessage.orderId) {
        const order = populatedMessage.orderId;
        orderData = {
          id: order._id,
          orderNumber: order.orderNumber,
          total: order.total,
          status: order.status,
        };
      }

      const formattedMessage = {
        _id: message._id,
        text: message.text,
        senderId: senderId,
        senderName: sender.fullName || sender.name,
        senderAvatar: sender.avatar,
        type: message.type,
        media: message.media || [],
        status: message.status,
        createdAt: message.createdAt,
        product: productData,
        order: orderData,
      };

      // Emit socket event if socket.io is available
      const io = req.app.get("io");
      if (io) {
        // Get conversation to find the receiver
        const conversation = await Conversation.findById(conversationId);
        const receiverId = conversation.participants.find(
          (p) => p.toString() !== senderId.toString()
        );

        if (receiverId) {
          io.to(receiverId.toString()).emit(
            "receive-message",
            formattedMessage
          );
          io.to(senderId).emit("message-sent", formattedMessage);
        }
      }

      res.status(201).json({
        success: true,
        data: formattedMessage,
      });
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
  async deleteMessage(req, res) {
    try {
      const { messageId } = req.params;
      const userId = req.accountID;

      if (
        !mongoose.Types.ObjectId.isValid(messageId) ||
        !mongoose.Types.ObjectId.isValid(userId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID format",
        });
      }

      const message = await Message.findById(messageId);

      if (!message) {
        return res.status(404).json({
          success: false,
          message: "Message not found",
        });
      }

      if (message.senderId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized to delete this message",
        });
      }

      await Message.findByIdAndDelete(messageId);

      res.status(200).json({
        success: true,
        message: "Message deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting message:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new ChatController();
