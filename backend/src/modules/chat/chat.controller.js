const Message = require("../../models/Message");
const Account = require("../../models/Account");
const Conversation = require("../../models/Conversation");
const Product = require("../../models/Product");
const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { uploadMultipleToCloudinary } = require("../../utils/CloudinaryUpload");
const {
  generateEmbeddingFromText,
  EMBEDDING_DIMENSION,
  VECTOR_INDEX_NAME,
} = require("../../services/productEmbedding.service");
const { MESSAGES } = require("../../utils/messages");

const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-pro";
const PRODUCT_SUGGESTION_SYSTEM_PROMPT =
  "Bạn là chuyên gia tư vấn đồ cũ. Hãy dựa vào danh sách sản phẩm được cung cấp để gợi ý cho khách. Nếu không thấy đồ phù hợp, hãy lịch sự đề nghị khách thử từ khóa khác. Trả lời ngắn gọn, thân thiện.";

let chatGenAI;
let chatModel;

function getChatModel() {
  if (!process.env.GOOGLE_AI_KEY) {
    const err = new Error("GOOGLE_AI_KEY is missing");
    err.statusCode = 500;
    throw err;
  }

  if (!chatGenAI) {
    chatGenAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
  }
  if (!chatModel) {
    chatModel = chatGenAI.getGenerativeModel({
      model: CHAT_MODEL,
      systemInstruction: PRODUCT_SUGGESTION_SYSTEM_PROMPT,
    });
  }

  return chatModel;
}

// Helper function to create ObjectId safely
const createObjectId = (id) => {
  if (!id) return null;
  return mongoose.Types.ObjectId.createFromHexString(id);
};

class ChatController {
  async searchProductsByAI(req, res) {
    try {
      const userMessage = String(
        req.body?.userMessage || req.body?.query || "",
      ).trim();
      const limit = Math.min(
        10,
        Math.max(1, Number.parseInt(String(req.body?.limit ?? 3), 10) || 3),
      );
      if (!userMessage) {
        return res.status(400).json({
          answer: "Vui lòng nhập nội dung tìm kiếm.",
          products: [],
          data: [],
        });
      }

      const queryVector = await generateEmbeddingFromText(userMessage);
      const productProjection = {
        _id: 1,
        name: 1,
        slug: 1,
        price: 1,
        avatar: 1,
        images: 1,
        condition: 1,
        description: 1,
        stock: 1,
      };
      const productFilter = {
        status: { $in: ["approved", "active"] },
        stock: { $gt: 0 },
      };

      let products = [];
      let usedKeywordFallback = false;

      if (
        Array.isArray(queryVector) &&
        queryVector.length === EMBEDDING_DIMENSION
      ) {
        try {
          products = await Product.aggregate([
            {
              $vectorSearch: {
                index: VECTOR_INDEX_NAME,
                path: "embedding",
                queryVector,
                numCandidates: 120,
                limit,
                filter: productFilter,
              },
            },
            {
              $project: {
                ...productProjection,
                score: { $meta: "vectorSearchScore" },
              },
            },
          ]);
        } catch (vectorError) {
          console.error(
            "[AI Product Search] Vector search failed, fallback to keyword:",
            vectorError.message,
          );
          usedKeywordFallback = true;
        }
      } else {
        usedKeywordFallback = true;
      }

      if (usedKeywordFallback || products.length === 0) {
        const escapedQuery = userMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        products = await Product.find({
          ...productFilter,
          $or: [
            { name: { $regex: escapedQuery, $options: "i" } },
            { description: { $regex: escapedQuery, $options: "i" } },
          ],
        })
          .select(productProjection)
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
      }

      let answer = "";
      const productContext = products.map((item) => ({
        id: item._id,
        name: item.name,
        price: item.price,
        condition: item.condition,
        description: item.description,
        score: item.score != null ? Number(item.score || 0).toFixed(4) : null,
      }));
      try {
        const model = getChatModel();
        const prompt = [
          "Tin nhắn khách hàng:",
          userMessage,
          "",
          "Danh sách sản phẩm tìm được (JSON):",
          JSON.stringify(productContext),
        ].join("\n");
        const geminiResult = await model.generateContent(prompt);
        answer =
          geminiResult?.response?.text()?.trim() ||
          "Mình chưa tìm được gợi ý phù hợp, bạn thử mô tả chi tiết hơn nhé.";
      } catch (chatError) {
        console.error(
          "[AI Product Search] Chat model failed:",
          chatError.message,
        );
        answer =
          products.length > 0
            ? `Mình tìm thấy ${products.length} sản phẩm phù hợp. Bạn có thể xem danh sách bên dưới nhé.`
            : "Mình chưa tìm thấy sản phẩm phù hợp, bạn thử từ khóa khác nhé.";
      }

      return res.status(200).json({
        answer,
        products,
        data: products,
      });
    } catch (error) {
      console.error("[AI Product Search] Error:", error);

      const statusCode =
        error?.statusCode || error?.status || error?.response?.status || 500;
      if (statusCode === 403) {
        return res.status(500).json({
          answer: "Dịch vụ AI tạm thời chưa truy cập được (API key).",
          products: [],
        });
      }
      if (statusCode === 404) {
        return res.status(500).json({
          answer: "Model AI chưa sẵn sàng, vui lòng thử lại sau.",
          products: [],
        });
      }

      return res.status(500).json({
        answer: MESSAGES.SERVER_ERROR,
        products: [],
      });
    }
  }

  async uploadMedia(req, res) {
    try {
      const files = req.files || [];

      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.CHAT.NO_MEDIA_UPLOADED,
        });
      }

      const uploadedMedia = await uploadMultipleToCloudinary(
        files,
        "chat/media",
      );

      const formattedMedia = uploadedMedia.map((item) => ({
        type: item.type?.startsWith("video/") ? "video" : "image",
        url: item.url,
        publicId: item.publicId,
        name: item.name,
        size: item.size,
      }));

      return res.status(200).json({
        success: true,
        data: formattedMedia,
      });
    } catch (error) {
      console.error("Error uploading chat media:", error);
      return res.status(500).json({
        success: false,
        message: MESSAGES.CHAT.UPLOAD_FAILED,
        error: error.message,
      });
    }
  }

  async getConversationsList(req, res) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.accountID)) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.INVALID_ID,
        });
      }

      const userId = createObjectId(req.accountID);
      console.log("Getting conversations for user:", userId);

      // BÆ°á»›c 1: TÃ¬m táº¥t cáº£ cuá»™c trÃ² chuyá»‡n mÃ  ngÆ°á»i dÃ¹ng tham gia
      const conversations = await Conversation.aggregate([
        {
          $match: {
            participants: userId,
          },
        },
        // BÆ°á»›c 2: Lookup thÃ´ng tin ngÆ°á»i tham gia
        {
          $lookup: {
            from: "accounts",
            localField: "participants",
            foreignField: "_id",
            as: "participantDetails",
          },
        },
        // BÆ°á»›c 3: Äá»‹nh dáº¡ng thÃ´ng tin cuá»™c trÃ² chuyá»‡n
        {
          $project: {
            _id: 1,
            participants: "$participantDetails",
            updatedAt: 1,
            createdAt: 1,
          },
        },
      ]);

      // Láº¥y danh sÃ¡ch ID cuá»™c trÃ² chuyá»‡n
      const conversationIds = conversations.map((conv) => conv._id);

      // BÆ°á»›c 4: Láº¥y tin nháº¯n cuá»‘i cÃ¹ng cho má»—i cuá»™c trÃ² chuyá»‡n
      const lastMessages = await Message.aggregate([
        {
          $match: {
            conversationId: { $in: conversationIds },
          },
        },
        // NhÃ³m theo cuá»™c trÃ² chuyá»‡n vÃ  láº¥y tin nháº¯n má»›i nháº¥t
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

      // BÆ°á»›c 5: Äáº¿m sá»‘ tin nháº¯n chÆ°a Ä‘á»c cho má»—i cuá»™c trÃ² chuyá»‡n
      const unreadCounts = await Message.aggregate([
        {
          $match: {
            conversationId: { $in: conversationIds },
            senderId: { $ne: userId },
            isRead: false,
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: "$conversationId",
            count: { $sum: 1 },
          },
        },
      ]);

      // Táº¡o báº£n Ä‘á»“ cho tin nháº¯n cuá»‘i cÃ¹ng vÃ  sá»‘ lÆ°á»£ng chÆ°a Ä‘á»c
      const lastMessageMap = {};
      lastMessages.forEach((item) => {
        lastMessageMap[item._id.toString()] = item.lastMessage;
      });

      const unreadCountMap = {};
      unreadCounts.forEach((item) => {
        unreadCountMap[item._id.toString()] = item.count;
      });

      // Äá»‹nh dáº¡ng láº¡i dá»¯ liá»‡u cho frontend
      const formattedConversations = conversations.map((conv) => {
        const convId = conv._id.toString();
        // TÃ¬m ngÆ°á»i trÃ² chuyá»‡n (khÃ´ng pháº£i ngÆ°á»i dÃ¹ng hiá»‡n táº¡i)
        const partner =
          conv.participants.find(
            (p) => p._id.toString() !== userId.toString(),
          ) || {};

        const lastMsg = lastMessageMap[convId] || {};

        // XÃ¡c Ä‘á»‹nh loáº¡i tin nháº¯n vÃ  ná»™i dung hiá»ƒn thá»‹
        let displayText = lastMsg.text || "";
        let messageType = lastMsg.type || "";

        // Chuáº©n bá»‹ mÃ´ táº£ tin nháº¯n dá»±a trÃªn loáº¡i
        if (lastMsg.type === "image") {
          displayText = displayText || "ÄÃ£ gá»­i má»™t hÃ¬nh áº£nh";
        } else if (lastMsg.type === "video") {
          displayText = displayText || "ÄÃ£ gá»­i má»™t video";
        } else if (lastMsg.type === "product") {
          displayText = displayText || "ÄÃ£ gá»­i thÃ´ng tin sáº£n pháº©m";
        } else if (lastMsg.type === "order") {
          displayText = displayText || "ÄÃ£ gá»­i thÃ´ng tin Ä‘Æ¡n hÃ ng";
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

      // Lá»c bá» cÃ¡c cuá»™c trÃ² chuyá»‡n khÃ´ng cÃ³ Ä‘á»‘i tÃ¡c há»£p lá»‡
      const validConversations = formattedConversations.filter(
        (conv) => conv._id,
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
        message: MESSAGES.SERVER_ERROR,
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
          message: MESSAGES.INVALID_ID,
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
      });
      await message.save();
      // Get partner (seller) information
      const partner = await Account.findById(sellerObjectId).select(
        "name fullName avatar",
      );

      res.status(200).json({
        success: true,
        message: MESSAGES.CHAT.CONVERSATION_CREATED,
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
        message: MESSAGES.SERVER_ERROR,
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
          message: MESSAGES.INVALID_ID,
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

      // TÃ¬m tin nháº¯n vá»›i thÃ´ng tin Ä‘áº§y Ä‘á»§
      const messages = await Message.find({
        conversationId: conversation._id,
      })
        .sort({ createdAt: -1 }) // Newest first
        .skip(page * limit)
        .limit(limit)
        .populate("senderId", "name avatar") // ThÃ´ng tin ngÆ°á»i gá»­i
        .populate("productId") // ThÃ´ng tin sáº£n pháº©m
        .populate("orderId") // ThÃ´ng tin Ä‘Æ¡n hÃ ng
        .lean(); // Use lean() for better performance

      // Format and reverse messages to show in chronological order
      const formattedMessages = messages
        .map((message) => {
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
              // CÃ¡c thÃ´ng tin khÃ¡c cá»§a sáº£n pháº©m
            };
          }

          // Chuáº©n bá»‹ dá»¯ liá»‡u Ä‘Æ¡n hÃ ng (náº¿u cÃ³)
          let orderData = null;
          if (message.type === "order" && message.orderId) {
            orderData = {
              id: message.orderId._id,
              orderNumber: message.orderId.orderNumber,
              total: message.orderId.total,
              status: message.orderId.status,
              // CÃ¡c thÃ´ng tin khÃ¡c cá»§a Ä‘Æ¡n hÃ ng
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
            // Removed status field
            createdAt: message.createdAt,
            product: productData,
            order: orderData,
          };
        })
        .reverse(); // Reverse to get chronological order

      // Removed mark-as-read functionality

      // Get total message count for pagination info
      const totalMessages = await Message.countDocuments({
        conversationId: conversation._id,
      });

      // Láº¥y thÃ´ng tin ngÆ°á»i chat
      const partner = await Account.findById(partnerObjectId).select(
        "name fullName avatar",
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
        receiverId,
        text,
        type = "text",
        productId,
        orderId,
        media = [],
      } = req.body;
      const senderId = req.accountID;
      // Get sender info for response
      const sender = await Account.findById(senderId).select(
        "name avatar fullName",
      );
      const conversation = await Conversation.findOne({
        participants: {
          $all: [createObjectId(senderId), createObjectId(receiverId)],
        },
      });
      // 1. Tạo mới message và lưu vào DB
      const message = new Message({
        conversationId: conversation._id,
        senderId,
        receiverId,
        text,
        type,
        productId: type === "product" ? productId : undefined,
        orderId: type === "order" ? orderId : undefined,
        media,
      });
      await message.save();

      // 2. Populate product/order nếu cần
      let populatedMessage = message.toObject();
      if (type === "product" && productId) {
        populatedMessage = await Message.findById(message._id)
          .populate("productId")
          .lean();
      } else if (type === "order" && orderId) {
        populatedMessage = await Message.findById(message._id)
          .populate("orderId")
          .lean();
      }

      // 3. Chuẩn bị dữ liệu trả về
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
        createdAt: message.createdAt,
        product: productData,
        order: orderData,
      };

      // 4. Emit socket event nếu có socket.io
      const io = req.app.get("io");
      if (io) {
        io.to(receiverId).emit("receive-message", formattedMessage);
        io.to(senderId).emit("message-sent", formattedMessage);
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

  async markConversationAsRead(req, res) {
    try {
      const { conversationId } = req.params;
      const userId = req.accountID;

      if (
        !mongoose.Types.ObjectId.isValid(conversationId) ||
        !mongoose.Types.ObjectId.isValid(userId)
      ) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.INVALID_ID,
        });
      }

      const conversation =
        await Conversation.findById(conversationId).select("participants");
      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.CHAT.CONVERSATION_NOT_FOUND,
        });
      }

      const isParticipant = conversation.participants.some(
        (participantId) => participantId.toString() === userId,
      );

      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          message: MESSAGES.UNAUTHORIZED,
        });
      }

      const updateResult = await Message.updateMany(
        {
          conversationId: createObjectId(conversationId),
          senderId: { $ne: createObjectId(userId) },
          isRead: false,
          isDeleted: false,
        },
        {
          $set: {
            isRead: true,
            readAt: new Date(),
          },
        },
      );

      return res.status(200).json({
        success: true,
        message: MESSAGES.CHAT.CONVERSATION_MARKED_READ,
        updatedCount: updateResult.modifiedCount || 0,
      });
    } catch (error) {
      console.error("Error marking conversation as read:", error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new ChatController();
