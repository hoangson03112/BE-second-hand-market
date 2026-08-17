const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const Account = require("../models/Account"); // Đảm bảo đúng path model của bạn

const verifyToken = async (req, res, next) => {
  try {
    // 1. Lấy token: Ưu tiên Header (dành cho SSR Next.js hoặc Postman), nếu không có thì lấy từ Cookie (dành cho Browser/Axios)
    let token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      token = req.cookies?.accessToken; // Đọc từ HttpOnly Cookie
    }

    if (!token) {
      return res.status(401).json({
        status: "error",
        message: "Không tìm thấy token xác thực. Vui lòng đăng nhập lại.",
      });
    }

    // 2. Verify Token
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    req.accountID = decoded._id;

    const account = await Account.findById(decoded._id).select("status").lean();

    if (!account) {
      return res.status(401).json({
        status: "error",
        message: "Tài khoản không tồn tại hoặc đã bị xóa.",
      });
    }

    if (account.status === "banned") {
      return res.status(403).json({
        status: "error",
        code: "account_banned",
        message:
          "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên để được hỗ trợ.",
      });
    }

    next();
  } catch (error) {
    // Xử lý lỗi JWT (Hết hạn hoặc Token giả mạo)
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        status: "error",
        message: "Phiên đăng nhập đã hết hạn. Vui lòng làm mới trang.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      logger.warn(`Invalid token attempt: ${error.message}`);
      return res.status(401).json({
        status: "error",
        message: "Token không hợp lệ.",
      });
    }

    // Lỗi hệ thống
    logger.error(`Token verification error: ${error.message}`);
    return res.status(500).json({
      status: "error",
      message: "Lỗi máy chủ nội bộ.",
    });
  }
};

module.exports = verifyToken;
