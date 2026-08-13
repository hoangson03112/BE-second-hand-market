require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const config = require("./config/env");
const logger = require("./utils/logger");
const { errorHandler } = require("./middlewares/errorHandler");
const Product = require("./models/Product");

const { initRedisService, getRedisService } = require("./config/redis");
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

app.get("/health", async (req, res) => {
  const redis = getRedisService();

  await redis.ping();

  const productCount = await Product.countDocuments();

  res.json({
    status: "ok",
    productCount
  });
});

app.use(errorHandler);

module.exports = app;