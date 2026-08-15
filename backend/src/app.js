require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const config = require("./config/env");
const logger = require("./utils/logger");
const { errorHandler } = require("./middlewares/errorHandler");
const { wrapAsync } = require("./utils/safeRouter");
const { checkDependencies, isShuttingDown } = require("./utils/health");

const { initRedisService } = require("./config/redis");
initRedisService();

require("./config/passport");

const moduleRoutes = require("./modules");
const { applySecurityMiddleware } = require("./middlewares/security");

const app = express();

applySecurityMiddleware().forEach((middleware) => app.use(middleware));
logger.info("✅ Security middleware initialized");

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

// Allowlist origin: KHÔNG bao giờ chấp nhận "*" khi credentials=true. Phản chiếu
// origin tuỳ ý kèm cookie đồng nghĩa mọi website đều gọi được API này dưới danh
// nghĩa người dùng đang đăng nhập.
const allowedOrigins = String(config.cors.origin)
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s && s !== "*");

if (allowedOrigins.length === 0) {
  logger.error(
    "❌ CORS_ORIGIN chưa được cấu hình (hoặc đang để '*'). Đặt danh sách origin cụ thể, vì API dùng cookie credentials.",
  );
}

const corsOptions = {
  origin: function (origin, callback) {
    // Không có Origin: request cùng origin, server-to-server, curl... — cho qua.
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
};

app.use((req, res, next) => {
  cors(corsOptions)(req, res, (err) => {
    if (err) {
      return res.status(403).json({ message: err.message || "CORS error" });
    }
    next();
  });
});
app.use((req, res, next) => {
  res.setHeader("Connection", "keep-alive");
  next();
});
app.use("/eco-market", moduleRoutes);

/**
 * Health check chia hai vai trò khác nhau — đừng gộp:
 *
 *  /health/live  — process còn sống và event loop còn phản hồi. KHÔNG chạm
 *                  dependency nào. Đây là thứ orchestrator dùng để quyết định
 *                  RESTART. Nếu nó phụ thuộc Redis thì một lần Redis chớp nhịp
 *                  sẽ thành vòng lặp restart.
 *
 *  /health/ready — đã sẵn sàng nhận traffic chưa: Mongo + Redis đều trả lời.
 *                  Dùng cho load balancer để quyết định NGỪNG ĐƯA TRAFFIC.
 *                  Trả 503 khi chưa sẵn sàng.
 *
 *  /health       — giữ lại cho tương thích ngược (cron GitHub Actions và cấu
 *                  hình Render đang trỏ vào đây). Cùng ngữ nghĩa với /live.
 */

function livePayload() {
  return {
    status: "ok",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  };
}

app.get("/health", (req, res) => res.json(livePayload()));
app.get("/health/live", (req, res) => res.json(livePayload()));

app.get(
  "/health/ready",
  wrapAsync(async (req, res) => {
    // Đang tắt: báo not_ready ngay, khỏi tốn công probe dependency.
    if (isShuttingDown()) {
      return res.status(503).json({ status: "shutting_down" });
    }

    const { ok, checks } = await checkDependencies();

    res.status(ok ? 200 : 503).json({
      status: ok ? "ready" : "not_ready",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks
    });
  })
);

app.use(errorHandler);

module.exports = app;