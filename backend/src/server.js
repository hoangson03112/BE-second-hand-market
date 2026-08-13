const http = require("http");
const app = require("./app");
const config = require("./config/env");
const { connectDB } = require("./config/db");
const { initializeSocket } = require("./services/socket");
const { startAutoCompleteJob } = require("./utils/autoComplete");
const logger = require("./utils/logger");


connectDB().then(() => {
  startAutoCompleteJob();
}).catch((err) => {
  logger.error("DB connection failed, background jobs not started:", err.message);
});


const server = http.createServer(app);

server.timeout = 300000;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;


const io = initializeSocket(server);
app.set("io", io.instance);
app.set("userSocketMap", io.userSocketMap);


const PORT = config.port;
server.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📝 Environment: ${config.nodeEnv}`);
  logger.info(`📦 API: http://localhost:${PORT}/eco-market`);
});


process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  logger.error(err.stack);
  server.close(() => {
    process.exit(1);
  });
});


process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(err.stack);
  process.exit(1);
});