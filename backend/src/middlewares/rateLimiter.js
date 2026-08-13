const rateLimit = require("express-rate-limit");
const logger = require("../utils/logger");





const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later."
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip} on route: ${req.path}`);
    res.status(429).json({
      success: false,
      message: "Too many authentication attempts, please try again later."
    });
  }
});





const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many requests for this operation, please try again later."
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Strict rate limit exceeded for IP: ${req.ip} on route: ${req.path}`);
    res.status(429).json({
      success: false,
      message: "Too many requests for this operation, please try again later."
    });
  }
});





const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: "Too many requests, please try again later."
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`General rate limit exceeded for IP: ${req.ip} on route: ${req.path}`);
    res.status(429).json({
      success: false,
      message: "Too many requests, please try again later."
    });
  }
});





const appealLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Bạn đã gửi quá nhiều khiếu nại. Vui lòng thử lại sau 15 phút."
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Appeal rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: "Bạn đã gửi quá nhiều khiếu nại. Vui lòng thử lại sau 15 phút."
    });
  }
});

module.exports = {
  authLimiter,
  strictLimiter,
  generalLimiter,
  appealLimiter
};