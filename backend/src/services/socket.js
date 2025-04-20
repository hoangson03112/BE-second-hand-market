const socketIo = require("socket.io");
const Message = require("../models/Message");
const logger = require("../utils/logger");

const initializeSocket = (server) => {
  // Store socketId by userId for direct messaging
  const userSocketMap = {};

  const io = socketIo(server, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    logger.info(`New client connected: ${socket.id}`);

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
      logger.debug(`Current online users: ${Object.keys(userSocketMap).join(', ')}`);
    });

    // Handle socket error logging
    socket.on("connect_error", (error) => {
      logger.error(`Socket connection error: ${error.message}`);
    });

    // Handle sending messages
    socket.on("send-message", async (data) => {
      logger.debug(`Message from ${data.senderId} to ${data.receiverId}`);
      
      try {
        // Save message to database
        const newMessage = new Message({
          sender: data.senderId,
          receiver: data.receiverId,
          text: data.text,
          createdAt: new Date(),
          isRead: false,
        });
        
        const savedMessage = await newMessage.save();
        logger.debug(`Message saved with ID: ${savedMessage._id}`);
        
        // Format message object
        const messageToSend = {
          _id: savedMessage._id,
          senderId: data.senderId,
          receiverId: data.receiverId,
          text: data.text,
          createdAt: savedMessage.createdAt,
          isRead: false
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

    // Handle marking messages as read
    socket.on("mark-as-read", async (data) => {
      try {
        logger.debug(`Marking message ${data.messageId} as read by ${data.currentUserId}`);
        
        // Update the message in the database
        const updatedMessage = await Message.findByIdAndUpdate(
          data.messageId, 
          { isRead: true }, 
          { new: true }
        );
        
        if (!updatedMessage) {
          logger.warn(`Message ${data.messageId} not found`);
          return;
        }
        
        // Send confirmation to all clients that need to know
        const senderRoom = updatedMessage.sender.toString();
        io.to(senderRoom).emit("message-read", { 
          messageId: updatedMessage._id, 
          senderId: updatedMessage.sender,
          receiverId: updatedMessage.receiver
        });
        
      } catch (error) {
        logger.error(`Error marking message as read: ${error.message}`);
      }
    });

    // Handle typing indicator
    socket.on("typing", (data) => {
      logger.debug(`User ${data.senderId} is typing to ${data.receiverId}`);
      const receiverRoom = data.receiverId.toString();
      socket.to(receiverRoom).emit("user-typing", {
        senderId: data.senderId,
        receiverId: data.receiverId,
        isTyping: data.isTyping
      });
    });
    
    // Handle disconnection
    socket.on("disconnect", () => {
      logger.info(`Client disconnected: ${socket.id}`);
      
      // Find and remove user from userSocketMap
      const userId = Object.keys(userSocketMap).find(
        key => userSocketMap[key] === socket.id
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
    userSocketMap
  };
};

module.exports = {
  initializeSocket
}; 