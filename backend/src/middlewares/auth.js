const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

/**
 * Middleware to verify JWT access token
 */
const verifyAccessToken = (req, res, next) => {
  try {
    // Get token from Authorization header
    let token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(403).json({ 
        success: false,
        message: "Access token is required" 
      });
    }

    // Verify access token
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        logger.warn(`Invalid access token: ${err.message}`);
        return res.status(401).json({ 
          success: false,
          message: "Access token expired or invalid" 
        });
      }

      // Set user info in request for use in controllers
      req.accountID = decoded._id;
      req.user = decoded;

      // Continue to next middleware or controller
      next();
    });
  } catch (error) {
    logger.error(`Access token verification error: ${error.message}`);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error" 
    });
  }
};

/**
 * Middleware to verify JWT refresh token
 * Verify token từ cookie và kiểm tra trong database
 */
const verifyRefreshToken = async (req, res, next) => {
  try {
    // Get refresh token từ cookie (không nhận từ body để bảo mật hơn)
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(403).json({ 
        success: false,
        message: "Refresh token is required" 
      });
    }

    // Verify JWT token
    jwt.verify(refreshToken, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        logger.warn(`Invalid refresh token: ${err.message}`);
        return res.status(401).json({ 
          success: false,
          message: "Refresh token expired or invalid" 
        });
      }

      // Kiểm tra refreshToken có tồn tại trong database không
      const Account = require("../models/Account");
      const account = await Account.findById(decoded._id);

      if (!account) {
        return res.status(404).json({ 
          success: false,
          message: "Account not found" 
        });
      }

      // Kiểm tra absolute expiration trước (thời hạn tuyệt đối)
      if (
        account.refreshTokenAbsoluteExpires &&
        new Date() > account.refreshTokenAbsoluteExpires
      ) {
        // Xóa refreshToken khi hết hạn tuyệt đối
        account.refreshToken = undefined;
        account.refreshTokenExpires = undefined;
        account.refreshTokenAbsoluteExpires = undefined;
        await account.save();

        return res.status(401).json({ 
          success: false,
          message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
          code: "ABSOLUTE_EXPIRATION"
        });
      }

      // Kiểm tra refreshToken trong DB có khớp không và chưa hết hạn (sliding expiration)
      if (
        account.refreshToken !== refreshToken ||
        !account.refreshTokenExpires ||
        new Date() > account.refreshTokenExpires
      ) {
        // Xóa refreshToken cũ nếu không hợp lệ
        account.refreshToken = undefined;
        account.refreshTokenExpires = undefined;
        account.refreshTokenAbsoluteExpires = undefined;
        await account.save();

        return res.status(401).json({ 
          success: false,
          message: "Refresh token is invalid or expired" 
        });
      }

      // Set user info in request for use in controllers
      req.accountID = decoded._id;
      req.user = decoded;
      req.refreshToken = refreshToken;

      // Continue to next middleware or controller
      next();
    });
  } catch (error) {
    logger.error(`Refresh token verification error: ${error.message}`);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error" 
    });
  }
};

module.exports = {
  verifyAccessToken,
  verifyRefreshToken
};
