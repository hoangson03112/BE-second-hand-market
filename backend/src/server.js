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

/** Handle để dừng job nền lúc tắt; gán sau khi DB kết nối xong. */
let stopAutoCompleteJob = null;

connectDB()
  .then(() => {
    stopAutoCompleteJob = startAutoCompleteJob();
  })
  .catch((err) => {
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

/* ─────────────────────────── Tắt êm ─────────────────────────── */

/**
 * Thời gian chờ load balancer nhận ra /health/ready đã 503 trước khi ngừng
 * nhận connection mới. Ở dev thì bỏ qua để Ctrl+C thoát ngay.
 */
const DRAIN_MS = config.isProduction ? 5000 : 0;

/** Quá hạn này thì thoát cứng, không chờ nữa. */
const SHUTDOWN_TIMEOUT_MS = 20000;

let shutdownStarted = false;

function closeHttpServer() {
  return new Promise((resolve) => {
    server.close(() => resolve());

    // `server.close()` chỉ ngừng nhận connection MỚI; connection keep-alive
    // đang rảnh vẫn giữ server sống tới 65s (keepAliveTimeout). Đóng chúng
    // ngay, nếu không mỗi lần deploy phải chờ hơn một phút.
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

  // Bật cờ TRƯỚC mọi thứ khác: /health/ready trả 503 ngay, load balancer rút
  // instance này khỏi pool trong lúc ta vẫn phục vụ nốt request đang dở.
  setShuttingDown(true);

  // Lưới an toàn: treo ở bất kỳ bước nào cũng không được giữ container mãi.
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
    await mongoose.connection.close(false);
  });

  await runStep("đóng Redis", async () => {
    const redis = getRedisService();
    if (redis && typeof redis.disconnect === "function") {
      await redis.disconnect();
    }
  });

  logger.info("✅ Đã tắt êm");

  if (exitCode !== 0) {
    clearTimeout(forceExit);
    process.exit(exitCode);
    return;
  }

  // Không gọi process.exit(0): để event loop tự cạn. Nếu process thoát ngay,
  // nghĩa là mọi handle đã đóng sạch. Nếu còn treo, `forceExit` ở trên sẽ bắn
  // và thoát với mã 1 — đó chính là tín hiệu có handle bị rò rỉ.
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled Rejection: ${err?.message}`);
  logger.error(err?.stack);
  shutdown("unhandledRejection", 1);
});

// State đã không xác định — không cố phục vụ nốt request, chỉ đóng tài nguyên
// nhanh nhất có thể rồi thoát.
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(err.stack);
  shutdown("uncaughtException", 1);
});

module.exports = { server, shutdown };
