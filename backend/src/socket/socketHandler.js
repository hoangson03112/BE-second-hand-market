const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Account = require('../models/Account');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Map to store user socket connections
const userSocketMap = new Map();
// Set of online users
const onlineUsers = new Set();

const socketHandler = (io) => {
  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication error: Token not provided'));
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return next(new Error('Authentication error: Invalid token'));
      }
      socket.userId = decoded.id;
      next();
    });
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Handle join room event
    socket.on('join-room', (userId) => {
      if (!userId) return;
      
      // Store mapping between userId and socketId
      userSocketMap.set(userId, socket.id);
      // Add userId to online users set
      onlineUsers.add(userId);

      // Send online users list to all clients
      io.emit('online-users', Array.from(onlineUsers));
      // Notify other clients that this user is online
      socket.broadcast.emit('user-connected', userId);

      console.log(`User ${userId} joined with socket ${socket.id}`);
      console.log('Online users:', Array.from(onlineUsers));
    });

    // Handle send message event
    socket.on('send-message', async (messageData) => {
      try {
        // Validate required fields
        if (!messageData.senderId || !messageData.receiverId) {
          socket.emit('error', 'Missing required fields');
          return;
        }

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(messageData.senderId) || 
            !mongoose.Types.ObjectId.isValid(messageData.receiverId)) {
          socket.emit('error', 'Invalid ID format');
          return;
        }

        // Find or create conversation
        let conversation = await Conversation.findOne({
          participants: { 
            $all: [
              new mongoose.Types.ObjectId(messageData.senderId), 
              new mongoose.Types.ObjectId(messageData.receiverId)
            ] 
          }
        });

        if (!conversation) {
          // Create new conversation
          conversation = new Conversation({
            participants: [messageData.senderId, messageData.receiverId],
          });
          await conversation.save();
        } else {
          // Update conversation's updatedAt timestamp
          await Conversation.findByIdAndUpdate(conversation._id, {
            $currentDate: { updatedAt: true }
          });
        }

        // Create and save message
        const newMessage = new Message({
          conversationId: conversation._id,
          senderId: messageData.senderId,
          type: messageData.type || "text",
          text: messageData.text || "",
          status: "sent",
          media: messageData.media || []
        });

        const savedMessage = await newMessage.save();

        // Get sender info for response
        const sender = await Account.findById(messageData.senderId).select("name avatar");

        const messageToSend = {
          _id: savedMessage._id,
          senderId: messageData.senderId,
          receiverId: messageData.receiverId,
          senderName: sender ? sender.name : "Unknown",
          senderAvatar: sender ? sender.avatar : null,
          text: messageData.text || "",
          type: messageData.type || "text",
          media: messageData.media || [],
          status: savedMessage.status,
          createdAt: savedMessage.createdAt,
          conversationId: conversation._id,
          tempMsgId: messageData.tempMsgId // Pass back temp ID for client-side matching
        };

        // Send confirmation to sender
        socket.emit('message-sent', messageToSend);

        // Get receiver's socketId if they are online
        const receiverSocketId = userSocketMap.get(messageData.receiverId.toString());

        if (receiverSocketId) {
          // Send message to receiver if they are online
          io.to(receiverSocketId).emit('receive-message', messageToSend);
        } else {
          // If receiver is offline, send notification for when they come online
          console.log(`User ${messageData.receiverId} is offline, message queued`);
          // Send new message notification (can be used to update UI)
          io.emit('new-message-notification', {
            senderId: messageData.senderId,
            message: messageData.text || 'Sent an attachment',
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Error handling message:', error);
        socket.emit('error', 'Failed to send message');
      }
    });

    // Handle mark as read event
    socket.on('mark-as-read', async (data) => {
      try {
        const { messageId, userId } = data;
        
        if (!mongoose.Types.ObjectId.isValid(messageId)) {
          console.error('Invalid message ID format');
          return;
        }

        // Update message status in database
        const updatedMessage = await Message.findByIdAndUpdate(
          messageId,
          { status: "read" },
          { new: true }
        ).populate("senderId", "name avatar");

        if (!updatedMessage) {
          console.warn(`Message ${messageId} not found`);
          return;
        }

        // Send confirmation to the sender that message was read
        const senderSocketId = userSocketMap.get(updatedMessage.senderId._id.toString());
        if (senderSocketId) {
          io.to(senderSocketId).emit('message-read', {
            messageId: updatedMessage._id,
            senderId: updatedMessage.senderId._id,
            conversationId: updatedMessage.conversationId
          });
        }
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    });

    // Handle typing indicator
    socket.on('typing', (data) => {
      const { senderId, receiverId } = data;
      if (!senderId || !receiverId) {
        console.warn('Missing sender or receiver ID in typing event');
        return;
      }

      const receiverSocketId = userSocketMap.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('user-typing', {
          senderId,
          receiverId,
          typing: true
        });
      }
    });

    // Handle stop typing event
    socket.on('stop-typing', (data) => {
      const { senderId, receiverId } = data;
      if (!senderId || !receiverId) {
        return;
      }
      
      const receiverSocketId = userSocketMap.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('user-typing', {
          senderId,
          receiverId,
          typing: false
        });
      }
    });

    // Handle disconnect event
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);

      // Find userId based on socketId
      let disconnectedUserId = null;
      for (const [userId, socketId] of userSocketMap.entries()) {
        if (socketId === socket.id) {
          disconnectedUserId = userId;
          break;
        }
      }

      if (disconnectedUserId) {
        // Remove from connections list
        userSocketMap.delete(disconnectedUserId);
        // Remove from online users list
        onlineUsers.delete(disconnectedUserId);
        // Notify other clients
        socket.broadcast.emit('user-disconnected', disconnectedUserId);
        console.log(`User ${disconnectedUserId} disconnected`);
        console.log('Online users:', Array.from(onlineUsers));
      }
    });
  });
};

module.exports = socketHandler; 