const http = require("http");
const app = require("./app");
const config = require("./config/env");
const { connectDB } = require("./config/db");
const { initializeSocket } = require("./services/socket");
const { startAutoCompleteJob } = require("./utils/autoComplete");
const logger = require("./utils/logger");

// Connect to database and start background jobs
connectDB().then(() => {
  startAutoCompleteJob();
}).catch((err) => {
  logger.error("DB connection failed, background jobs not started:", err.message);
});

// Create HTTP server
const server = http.createServer(app);

// Increase timeouts to handle large file uploads and AI processing
server.timeout = 300000;       // 5 minutes
server.keepAliveTimeout = 65000; // 65 seconds
server.headersTimeout = 66000;   // Must be greater than keepAliveTimeout

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
