require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const config = require("./config/app.config");
const logger = require("./utils/logger");
const { errorHandler } = require("./shared/errors/errorHandler");

const { initRedisService } = require("./services/redis.service");
initRedisService();

require("./config/passportGoogle");

const legacyRoutes = require("./routes");
const { applySecurityMiddleware } = require("./shared/middleware/security.middleware");

const app = express();

applySecurityMiddleware().forEach(middleware => app.use(middleware));
logger.info("✅ Security middleware initialized");

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

const rawCors = config.cors.origin;
const allowedOrigins = rawCors.split(",").map((s) => s.trim());

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.length === 1 && allowedOrigins[0] === "*") {
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: config.cors.credentials,
};

app.use((req, res, next) => {
  cors(corsOptions)(req, res, (err) => {
    if (err) return res.status(403).json({ message: err.message || "CORS error" });
    if (allowedOrigins.length === 1 && allowedOrigins[0] === "*") {
      const originHeader = req.headers.origin;
      if (originHeader) {
        res.setHeader("Access-Control-Allow-Origin", originHeader);
      }
    }
    next();
  });
});

app.use("/eco-market", legacyRoutes);

app.get("/health", async (req, res) => {
  const { getRedisService } = require("./services/redis.service");
  const redis = getRedisService();
  
  const redisHealthy = await redis.ping();
  const redisStats = await redis.getStats();

  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    services: {
      redis: {
        connected: redisHealthy,
        keysCount: redisStats.keysCount,
      },
    },
  });
});

app.use(errorHandler);

module.exports = app;


