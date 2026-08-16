const socketIo = require("socket.io");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const Account = require("../models/Account");
const mongoose = require("mongoose");
const logger = require("../utils/logger");

let _ioInstance = null;

const _initializeSocket = (server) => {

  const userSocketMap = {};

  const io = socketIo(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      credentials: true,
      allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
      "X-CSRF-TOKEN"]

    },

    pingTimeout: 60000,
    pingInterval: 25000,

    allowEIO3: true
  });

  io.on("connection", (socket) => {
    logger.info(`[INFO] New client connected: ${socket.id}`);


    socket.on("join-room", (userId) => {
      if (!userId) {
        logger.warn("User tried to join room without userId");
        return;
      }


      if (!userSocketMap[userId]) {
        userSocketMap[userId] = [];
      }
      userSocketMap[userId].push(socket.id);


      const room = userId.toString();
      socket.join(room);
      console.log(`[SOCKET] User ${userId} joined room ${room} (socket: ${socket.id})`);
      logger.debug(`User ${userId} joined room ${room}`);


      socket.broadcast.emit("user-connected", userId);


      socket.emit("online-users", Object.keys(userSocketMap));
      logger.debug(
        `Current online users: ${Object.keys(userSocketMap).join(", ")}`
      );
    });


    socket.on("connect_error", (error) => {
      logger.error(`Socket connection error: ${error.message}`);
    });


    socket.on("send-message", async (data) => {
      try {
        console.log("send-message", data);

        if (!data.conversationId) {
          logger.error("Missing required fields in send-message");
          socket.emit("message-error", { error: "Missing required fields" });
          return;
        }


        if (!mongoose.Types.ObjectId.isValid(data.conversationId)) {
          logger.error("Invalid ID format in send-message");
          socket.emit("message-error", { error: "Invalid ID format" });
          return;
        }


        let conversation = await Conversation.findById(data.conversationId);


        const newMessage = new Message({
          conversationId: conversation._id,
          senderId: data.senderId,
          type: data.type || "text",
          text: data.text || "",
          media: data.media || []
        });

        const savedMessage = await newMessage.save();


        await Conversation.findByIdAndUpdate(conversation._id, {
          lastMessage: savedMessage._id
        });


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
          media: Array.isArray(data.media) ? data.media : [],
          createdAt: savedMessage.createdAt,
          conversationId: conversation._id,
          tempMsgId: data.tempMsgId
        };


        socket.emit("message-sent", messageToSend);


        const receiverSockets = userSocketMap[data.receiverId] || [];
        receiverSockets.forEach((socketId) => {
          io.to(socketId).emit("receive-message", messageToSend);
        });


        const receiverRoom = data.receiverId.toString();
        io.to(receiverRoom).emit("new-message-notification", {
          senderId: data.senderId,
          senderName: sender ? sender.fullName || sender.name || "Người dùng" : "Người dùng",
          conversationId: conversation._id,
          message: data.text || "Đã gửi một tệp đính kèm",
          timestamp: savedMessage.createdAt
        });
      } catch (error) {
        logger.error(`Error saving message: ${error.message}`);
        socket.emit("message-error", { error: "Failed to send message" });
      }
    });


    socket.on("disconnect", () => {
      logger.info(`[INFO] Client disconnected: ${socket.id}`);


      const userId = Object.keys(userSocketMap).find((key) =>
      userSocketMap[key].includes(socket.id)
      );
      if (userId) {
        userSocketMap[userId] = userSocketMap[userId].filter(
          (id) => id !== socket.id
        );
        if (userSocketMap[userId].length === 0) {
          delete userSocketMap[userId];

          io.emit("user-disconnected", userId);
          logger.debug(`User ${userId} is now offline`);
        }
      }
    });


    socket.on("error", (error) => {
      logger.error(`Socket error: ${error.message}`);
    });
  });

  return {
    instance: io,
    userSocketMap
  };
};


const getIO = () => _ioInstance;

module.exports = {
  initializeSocket: (server) => {
    const result = _initializeSocket(server);
    _ioInstance = result.instance;
    return result;
  },
  getIO
};