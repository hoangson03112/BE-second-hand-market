const jwt = require("jsonwebtoken");
const Account = require("../models/Account");

const verifyAdmin = async (req, res, next) => {
  try {

    if (!req.accountID) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - No token provided"
      });
    }


    const account = await Account.findById(req.accountID);

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Account not found"
      });
    }


    if (account.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Forbidden - Admin access required"
      });
    }


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