const jwt = require("jsonwebtoken");
const Account = require("../models/Account");





const optionalVerifyToken = async (req, res, next) => {
  try {
    // Phải đọc cả cookie: trình duyệt xác thực bằng cookie httpOnly chứ không
    // gửi header Authorization. Nếu chỉ đọc header thì mọi người dùng đã đăng
    // nhập đều bị coi là khách trên các route dùng optional auth.
    const token =
      req.headers.authorization?.split(" ")[1] || req.cookies?.accessToken;
    if (!token) return next();

    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, data) => {
        if (err) reject(err);else
        resolve(data);
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