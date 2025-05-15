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
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
  

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
        // Validate required fields
        if (!data.senderId) {
          logger.error("Missing required fields in send-message");
          socket.emit("message-error", { error: "Missing required fields" });
          return;
        }

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(data.senderId)) {
          logger.error("Invalid ID format in send-message");
          socket.emit("message-error", { error: "Invalid ID format" });
          return;
        }

        // Find or create conversation
        let conversation = await Conversation.findOne({
          participants: { 
            $all: [
              new mongoose.Types.ObjectId(data.senderId), 
              new mongoose.Types.ObjectId(data.receiverId)
            ] 
          }
        });

        if (!conversation) {
          // Create new conversation
          conversation = new Conversation({
            participants: [data.senderId, data.receiverId],
          });
          await conversation.save();
        }

        // Create and save message
        const newMessage = new Message({
          conversationId: conversation._id,
          senderId: data.senderId,
          type: data.type || "text",
          text: data.text || "",
          status: "sent",
          media: data.media || []
        });

        const savedMessage = await newMessage.save();

        // Update conversation with lastMessage
        await Conversation.findByIdAndUpdate(conversation._id, {
          lastMessage: savedMessage._id,
        });

        // Get sender info for response
        const sender = await Account.findById(data.senderId).select("name avatar");

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
          createdAt: savedMessage.createdAt,
          conversationId: conversation._id,
          tempMsgId: data.tempMsgId // Pass back temp ID for client-side matching
        };

        // Send confirmation to sender
        socket.emit("message-sent", messageToSend);

        // Send directly to receiver's room if they are online
        const receiverRoom = data.receiverId.toString();
        io.to(receiverRoom).emit("receive-message", messageToSend);
      } catch (error) {
        logger.error(`Error saving message: ${error.message}`);
        socket.emit("message-error", { error: "Failed to send message" });
      }
    });

    socket.on("mark-as-read", async (data) => {
      try {
        logger.debug(
          `Marking message ${data.messageId} as read by ${data.userId}`
        );

        if (!mongoose.Types.ObjectId.isValid(data.messageId)) {
          logger.error("Invalid message ID format");
          return;
        }

        // Update the message in the database
        const updatedMessage = await Message.findByIdAndUpdate(
          data.messageId,
          { status: "read" },
          { new: true }
        ).populate("senderId", "name avatar");

        if (!updatedMessage) {
          logger.warn(`Message ${data.messageId} not found`);
          return;
        }

        // Send confirmation to sender that message was read
        const senderRoom = updatedMessage.senderId._id.toString();
        io.to(senderRoom).emit("message-read", {
          messageId: updatedMessage._id,
          senderId: updatedMessage.senderId._id,
          conversationId: updatedMessage.conversationId
        });
      } catch (error) {
        logger.error(`Error marking message as read: ${error.message}`);
      }
    });

    // Handle typing indicator
    socket.on("typing", (data) => {
      if (!data.senderId || !data.receiverId) {
        logger.warn("Missing sender or receiver ID in typing event");
        return;
      }

      logger.debug(`User ${data.senderId} is typing to ${data.receiverId}`);
      const receiverRoom = data.receiverId.toString();
      socket.to(receiverRoom).emit("user-typing", {
        senderId: data.senderId,
        receiverId: data.receiverId,
        typing: true
      });
    });

    socket.on("stop-typing", (data) => {
      if (!data.senderId || !data.receiverId) {
        return;
      }
      
      const receiverRoom = data.receiverId.toString();
      socket.to(receiverRoom).emit("user-typing", {
        senderId: data.senderId,
        receiverId: data.receiverId,
        typing: false
      });
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      logger.info(`Client disconnected: ${socket.id}`);

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
  });

  return {
    instance: io,
    userSocketMap,
  };
};

module.exports = {
  initializeSocket,
};
