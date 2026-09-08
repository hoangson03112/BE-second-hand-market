const jwt = require("jsonwebtoken");
const Account = require("../models/Account");

const optionalVerifyToken = async (req, res, next) => {
  try {
    const token = req.cookies?.accessToken;
    if (!token) return next();

    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, data) => {
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
