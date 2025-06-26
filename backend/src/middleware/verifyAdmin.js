const jwt = require("jsonwebtoken");
const Account = require("../models/Account");

const verifyAdmin = async (req, res, next) => {
  try {
    // Kiểm tra xem user đã đăng nhập chưa (từ verifyToken middleware)
    if (!req.accountID) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - No token provided"
      });
    }

    // Lấy thông tin account
    const account = await Account.findById(req.accountID);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Account not found"
      });
    }

    // Kiểm tra role admin (bạn cần thêm field role vào Account model)
    if (account.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Forbidden - Admin access required"
      });
    }

    // Thêm thông tin admin vào request
    req.admin = account;
    next();
  } catch (error) {
    console.error("Admin verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during admin verification"
    });
  }
};

module.exports = verifyAdmin; 