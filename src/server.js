const http = require("http");
const mongoose = require("mongoose");
const app = require("./app");
const config = require("./config/env");
const { connectDB } = require("./config/db");
const { getRedisService } = require("./config/redis");
const { initializeSocket } = require("./services/socket");
const { startAutoCompleteJob } = require("./utils/autoComplete");
const { setShuttingDown } = require("./utils/health");
const logger = require("./utils/logger");

let stopAutoCompleteJob = null;
let shutdownStarted = false;

const server = http.createServer(app);

// Cấu hình Timeout cho Server
server.timeout = 300000;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Khởi tạo Socket.IO
const io = initializeSocket(server);
app.set("io", io.instance);
app.set("userSocketMap", io.userSocketMap);

// Hàm khởi chạy ứng dụng
async function bootstrap() {
  try {
    await connectDB();
    stopAutoCompleteJob = startAutoCompleteJob();
  } catch (err) {
    logger.error("DB connection failed, background jobs not started:", err.message);
  }

  const PORT = config.port;
  server.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`📝 Environment: ${config.nodeEnv}`);
    logger.info(`📦 API: http://localhost:${PORT}/eco-market`);
  });
}

bootstrap();

// --- LOGIC GRACEFUL SHUTDOWN ---

const DRAIN_MS = config.isProduction ? 5000 : 0;
const SHUTDOWN_TIMEOUT_MS = 20000;

function closeHttpServer() {
  return new Promise((resolve) => {
    server.close(() => resolve());

    if (typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }
  });
}

async function runStep(label, fn) {
  try {
    await fn();
    logger.info(`  ✔ ${label}`);
  } catch (err) {
    logger.error(`  ✖ ${label}: ${err.message}`);
  }
}

async function shutdown(reason, exitCode = 0) {
  if (shutdownStarted) return;
  shutdownStarted = true;

  logger.info(`⏻ ${reason} — bắt đầu tắt êm`);
  setShuttingDown(true);

  // Lưới an toàn: Ép dừng tiến trình nếu xử lý quá thời hạn
  const forceExit = setTimeout(() => {
    logger.error(`Quá ${SHUTDOWN_TIMEOUT_MS}ms vẫn chưa tắt xong — thoát cứng`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  if (typeof forceExit.unref === "function") forceExit.unref();

  if (DRAIN_MS > 0) {
    logger.info(`  … chờ ${DRAIN_MS}ms cho load balancer rút traffic`);
    await new Promise((resolve) => setTimeout(resolve, DRAIN_MS));
  }

  await runStep("dừng job nền", async () => {
    if (stopAutoCompleteJob) stopAutoCompleteJob();
  });

  await runStep("đóng Socket.IO", async () => {
    await new Promise((resolve) => io.instance.close(resolve));
  });

  await runStep("đóng HTTP server (chờ request đang xử lý)", closeHttpServer);

  await runStep("đóng MongoDB", async () => {
    await mongoose.connection.close();
  });

  await runStep("đóng Redis", async () => {
    const redis = getRedisService();
    if (redis && typeof redis.disconnect === "function") {
      await redis.disconnect();
    }
  });

  clearTimeout(forceExit);
  logger.info("✅ Đã tắt êm");

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

// System event listeners
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled Rejection: ${err?.message}`);
  logger.error(err?.stack);
  shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(err.stack);
  shutdown("uncaughtException", 1);
});

module.exports = { server, shutdown };