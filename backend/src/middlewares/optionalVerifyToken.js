const jwt = require("jsonwebtoken");
const Account = require("../models/Account");

/**
 * Optional auth: nếu có token hợp lệ và account không bị banned thì set req.accountID.
 * Không trả lỗi khi thiếu token hoặc token không hợp lệ.
 */
const optionalVerifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return next();

    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, process.env.JWT_SECRET, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const account = await Account.findById(decoded._id).select("status").lean();
    if (account && account.status !== "banned") {
      req.accountID = decoded._id;
    }
    next();
  } catch {
    next();
  }
};

module.exports = optionalVerifyToken;
