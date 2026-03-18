const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const Account = require("../models/Account");

/**
 * Middleware to verify JWT token and ensure account is not banned.
 * Banned users get 403 with code 'account_banned' so frontend can show blocked overlay.
 */
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(403).json({ message: "No token provided" });
    }

    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, process.env.JWT_SECRET, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    req.accountID = decoded._id;

    const account = await Account.findById(decoded._id).select("status").lean();
    if (!account) {
      return res.status(401).json({ message: "Account not found" });
    }
    if (account.status === "banned") {
      return res.status(403).json({
        code: "account_banned",
        message: "Tài khoản của bạn đã bị khóa. Bạn không thể thực hiện thao tác. Nếu cho rằng đây là nhầm lẫn, vui lòng gửi khiếu nại đến quản trị viên.",
      });
    }

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      logger.warn(`Invalid token: ${error.message}`);
      return res.status(401).json({ message: "JWT expired or invalid" });
    }
    logger.error(`Token verification error: ${error.message}`);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = verifyToken;
