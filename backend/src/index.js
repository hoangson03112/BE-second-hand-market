const http = require("http");
const app = require("./app");
const config = require("./config/app.config");
const { connectDB } = require("./config/db");
const { initializeSocket } = require("./services/socket");
const logger = require("./utils/logger");

// Connect to database
connectDB();

// Create HTTP server
const server = http.createServer(app);

// ⭐ Tăng timeout cho server để xử lý upload file lớn và AI moderation
// Default timeout của Node.js là 2 phút (120s), tăng lên 5 phút cho upload + AI processing
server.timeout = 300000; // 5 phút (300 giây)
server.keepAliveTimeout = 65000; // 65 giây
server.headersTimeout = 66000; // 66 giây (phải lớn hơn keepAliveTimeout)

// Initialize Socket.IO
const io = initializeSocket(server);
app.set("io", io.instance);
app.set("userSocketMap", io.userSocketMap);

// Start server
const PORT = config.port;
server.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📝 Environment: ${config.nodeEnv}`);
  logger.info(`📦 API: http://localhost:${PORT}/eco-market`);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  logger.error(err.stack);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(err.stack);
  process.exit(1);
});
