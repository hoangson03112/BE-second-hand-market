const rateLimit = require("express-rate-limit");
const logger = require("../utils/logger");

/**
 * Standard rate limiter for authentication routes
 * Allows 10 requests per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later."
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip} on route: ${req.path}`);
    res.status(429).json({
      success: false,
      message: "Too many authentication attempts, please try again later."
    });
  }
});

/**
 * Strict rate limiter for sensitive operations
 * Allows 5 requests per 15 minutes per IP
 */
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
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

/**
 * General API rate limiter
 * Allows 100 requests per 15 minutes per IP
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
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

/**
 * Rate limiter cho gửi khiếu nại (tài khoản bị khóa)
 * 5 lần / 15 phút / IP
 */
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
