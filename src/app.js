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
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
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

function livePayload() {
  return {
    status: "ok",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

app.get("/health", (req, res) => res.json(livePayload()));
app.get("/health/live", (req, res) => res.json(livePayload()));

app.get(
  "/health/ready",
  wrapAsync(async (req, res) => {
    if (isShuttingDown()) {
      return res.status(503).json({ status: "shutting_down" });
    }

    const { ok, checks } = await checkDependencies();

    res.status(ok ? 200 : 503).json({
      status: ok ? "ready" : "not_ready",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks,
    });
  }),
);

app.use(errorHandler);

module.exports = app;
