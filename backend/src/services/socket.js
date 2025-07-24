const socketIo = require("socket.io");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const Account = require("../models/Account");
const mongoose = require("mongoose");
const logger = require("../utils/logger");

const initializeSocket = (server) => {
  // Store socketId by userId for direct messaging
  const userSocketMap = {};

  const io = socketIo(server, {
    cors: {
      origin: ["https://localhost:3000"],
      methods: ["GET", "POST"],
      credentials: true,
      allowedHeaders: ["Authorization", "Content-Type"],
    },
    // Tăng timeout cho polling
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on("connection", (socket) => {
    logger.info(`[INFO] New client connected: ${socket.id}`);

    // Handle user joining a room (based on their userID)
    socket.on("join-room", (userId) => {
      if (!userId) {
        logger.warn("User tried to join room without userId");
        return;
      }

      // Add user to userSocketMap
      userSocketMap[userId] = socket.id;

      // Join personal room based on userId
      const room = userId.toString();
      socket.join(room);
      logger.debug(`User ${userId} joined room ${room}`);

      // Broadcast to all clients that this user is online
      socket.broadcast.emit("user-connected", userId);

      // Send list of online users to the newly connected client
      socket.emit("online-users", Object.keys(userSocketMap));
      logger.debug(
        `Current online users: ${Object.keys(userSocketMap).join(", ")}`
      );
    });

    // Handle socket error logging
    socket.on("connect_error", (error) => {
      logger.error(`Socket connection error: ${error.message}`);
    });

    // Handle sending messages
    socket.on("send-message", async (data) => {
      try {
        console.log("send-message", data);

        if (!data.conversationId) {
          logger.error("Missing required fields in send-message");
          socket.emit("message-error", { error: "Missing required fields" });
          return;
        }

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(data.conversationId)) {
          logger.error("Invalid ID format in send-message");
          socket.emit("message-error", { error: "Invalid ID format" });
          return;
        }

        // Find or create conversation
        let conversation = await Conversation.findById(data.conversationId);

        // Create and save message
        const newMessage = new Message({
          conversationId: conversation._id,
          senderId: data.senderId,
          type: data.type || "text",
          text: data.text || "",
          status: "sent",
          media: data.media || [],
          isRead: false,
        });

        const savedMessage = await newMessage.save();

        // Update conversation with lastMessage
        await Conversation.findByIdAndUpdate(conversation._id, {
          lastMessage: savedMessage._id,
        });

        // Get sender info for response
        const sender = await Account.findById(data.senderId).select(
          "name avatar"
        );

        const messageToSend = {
          _id: savedMessage._id,
          senderId: data.senderId,
          receiverId: data.receiverId,
          senderName: sender ? sender.name : "Unknown",
          senderAvatar: sender ? sender.avatar : null,
          text: data.text || "",
          type: data.type || "text",
          media: data.media || [],
          status: savedMessage.status,
          isRead: savedMessage.isRead,
          createdAt: savedMessage.createdAt,
          conversationId: conversation._id,
          tempMsgId: data.tempMsgId, // Pass back temp ID for client-side matching
        };

        // Send confirmation to sender
        socket.emit("message-sent", messageToSend);

        // Send directly to receiver's room if they are online
        const receiverRoom = data.receiverId.toString();
        io.to(receiverRoom).emit("receive-message", messageToSend);

        // Send notification to receiver about new message
        io.to(receiverRoom).emit("new-message-notification", {
          senderId: data.senderId,
          message: data.text || "Đã gửi một tệp đính kèm",
          timestamp: savedMessage.createdAt,
        });
      } catch (error) {
        logger.error(`Error saving message: ${error.message}`);
        socket.emit("message-error", { error: "Failed to send message" });
      }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      logger.info(`[INFO] Client disconnected: ${socket.id}`);

      // Find and remove user from userSocketMap
      const userId = Object.keys(userSocketMap).find(
        (key) => userSocketMap[key] === socket.id
      );

      if (userId) {
        delete userSocketMap[userId];
        // Notify all clients that this user is offline
        io.emit("user-disconnected", userId);
        logger.debug(`User ${userId} is now offline`);
      }
    });

    // Handle general errors
    socket.on("error", (error) => {
      logger.error(`Socket error: ${error.message}`);
    });
  });

  return {
    instance: io,
    userSocketMap,
  };
};

module.exports = {
  initializeSocket,
};
