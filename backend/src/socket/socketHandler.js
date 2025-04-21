const MessageController = require('../controllers/MessageController');
const jwt = require('jsonwebtoken');
const { Types } = require('mongoose');

// Map để lưu trữ kết nối socket của mỗi người dùng
const userSocketMap = new Map();
// Danh sách người dùng trực tuyến
const onlineUsers = new Set();

const socketHandler = (io) => {
  // Middleware xác thực token
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

    // Xử lý sự kiện tham gia phòng
    socket.on('join-room', (userId) => {
      if (!userId) return;
      
      // Lưu mapping giữa userId và socketId
      userSocketMap.set(userId, socket.id);
      // Thêm userId vào danh sách người dùng trực tuyến
      onlineUsers.add(userId);

      // Gửi danh sách người dùng trực tuyến cho tất cả clients
      io.emit('online-users', Array.from(onlineUsers));
      // Thông báo cho clients khác biết người dùng này đã online
      socket.broadcast.emit('user-connected', userId);

      console.log(`User ${userId} joined with socket ${socket.id}`);
      console.log('Online users:', Array.from(onlineUsers));
    });

    // Xử lý sự kiện gửi tin nhắn
    socket.on('send-message', async (messageData) => {
      try {
        // Chuyển đổi ID từ chuỗi sang ObjectId nếu cần
        const message = {
          ...messageData,
          senderId: Types.ObjectId.isValid(messageData.senderId) 
            ? messageData.senderId 
            : new Types.ObjectId(messageData.senderId),
          receiverId: Types.ObjectId.isValid(messageData.receiverId) 
            ? messageData.receiverId 
            : new Types.ObjectId(messageData.receiverId)
        };

        // Lưu tin nhắn vào database
        const savedMessage = await MessageController.saveMessage(message);

        // Gửi xác nhận tin nhắn cho người gửi
        socket.emit('message-sent', savedMessage);

        // Lấy socketId của người nhận (nếu họ đang online)
        const receiverSocketId = userSocketMap.get(messageData.receiverId.toString());

        if (receiverSocketId) {
          // Gửi tin nhắn đến người nhận nếu họ đang online
          io.to(receiverSocketId).emit('receive-message', savedMessage);
        } else {
          // Nếu không online, gửi thông báo để khi họ online sẽ thấy
          console.log(`User ${messageData.receiverId} is offline, message queued`);
          // Gửi thông báo tin nhắn mới (có thể được sử dụng để cập nhật UI)
          io.emit('new-message-notification', {
            senderId: messageData.senderId,
            message: messageData.text || 'Đã gửi một file đính kèm',
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Error handling message:', error);
        socket.emit('error', 'Failed to send message');
      }
    });

    // Xử lý sự kiện đánh dấu tin nhắn đã đọc
    socket.on('mark-as-read', async (data) => {
      try {
        const { messageId, userId } = data;
        const updatedMessage = await MessageController.markAsRead(messageId, userId);

        if (updatedMessage) {
          // Thông báo cho người gửi biết tin nhắn đã được đọc
          const senderSocketId = userSocketMap.get(updatedMessage.senderId.toString());
          if (senderSocketId) {
            io.to(senderSocketId).emit('message-read', { messageId });
          }
        }
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    });

    // Xử lý sự kiện typing
    socket.on('typing', (data) => {
      const { senderId, receiverId } = data;
      const receiverSocketId = userSocketMap.get(receiverId);

      if (receiverSocketId) {
        io.to(receiverSocketId).emit('user-typing', {
          senderId,
          receiverId,
          typing: true
        });
      }
    });

    // Xử lý sự kiện dừng typing
    socket.on('stop-typing', (data) => {
      const { senderId, receiverId } = data;
      const receiverSocketId = userSocketMap.get(receiverId);

      if (receiverSocketId) {
        io.to(receiverSocketId).emit('user-typing', {
          senderId,
          receiverId,
          typing: false
        });
      }
    });

    // Xử lý sự kiện ngắt kết nối
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);

      // Tìm userId dựa trên socketId
      let disconnectedUserId = null;
      for (const [userId, socketId] of userSocketMap.entries()) {
        if (socketId === socket.id) {
          disconnectedUserId = userId;
          break;
        }
      }

      if (disconnectedUserId) {
        // Xóa khỏi danh sách kết nối
        userSocketMap.delete(disconnectedUserId);
        // Xóa khỏi danh sách người dùng trực tuyến
        onlineUsers.delete(disconnectedUserId);
        // Thông báo cho các clients khác
        socket.broadcast.emit('user-disconnected', disconnectedUserId);
        console.log(`User ${disconnectedUserId} disconnected`);
        console.log('Online users:', Array.from(onlineUsers));
      }
    });
  });
};

module.exports = socketHandler; 