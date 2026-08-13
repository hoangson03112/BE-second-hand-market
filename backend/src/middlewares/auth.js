const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const { clearAuthCookies } = require("../utils/cookieHelper");
const { matchRefreshToken, revokeSession } = require("../services/token.service");

/**
 * Lấy access token: ưu tiên header (Postman/SSR), sau đó tới cookie httpOnly
 * (trình duyệt). Trước đây middleware này chỉ đọc header nên mọi request từ
 * trình duyệt đều bị 403 sau khi FE chuyển sang xác thực bằng cookie.
 */
const verifyAccessToken = (req, res, next) => {
  const token =
    req.headers.authorization?.split(" ")[1] || req.cookies?.accessToken;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Bạn cần đăng nhập để tiếp tục.",
    });
  }

  jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({
        success: false,
        message: "Access token expired or invalid",
      });
    }

    req.accountID = decoded._id;
    req.user = decoded;
    next();
  });
};

/**
 * Xác thực refresh token cho /auth/refresh.
 *
 * Quy tắc:
 *  - Token phải khớp HASH đang lưu trong DB (hoặc hash vừa bị xoay vòng, trong
 *    cửa sổ ân hạn) — không so sánh chuỗi thô.
 *  - Không khớp trong khi tài khoản VẪN đang có phiên sống ⇒ đây là token cũ
 *    bị dùng lại (có thể đã bị đánh cắp) ⇒ thu hồi toàn bộ phiên.
 *  - Quá hạn tuyệt đối ⇒ buộc đăng nhập lại, không gia hạn thêm.
 */
const verifyRefreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: "Bạn cần đăng nhập để tiếp tục.",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      logger.warn(`Invalid refresh token: ${err.message}`);
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      });
    }

    const Account = require("../models/Account");
    const account = await Account.findById(decoded._id).select(
      "+refreshTokenHash +previousRefreshTokenHash",
    );

    if (!account) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: "Phiên đăng nhập không còn hiệu lực.",
      });
    }

    if (account.status === "banned") {
      await revokeSession(account);
      clearAuthCookies(res);
      return res.status(403).json({
        success: false,
        code: "account_banned",
        message: "Tài khoản của bạn đã bị khóa.",
      });
    }

    // Trần tuyệt đối: dù refresh liên tục cũng không sống quá 30 ngày.
    if (
      account.refreshTokenAbsoluteExpires &&
      new Date() > account.refreshTokenAbsoluteExpires
    ) {
      await revokeSession(account);
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
        code: "ABSOLUTE_EXPIRATION",
      });
    }

    if (
      !account.refreshTokenExpires ||
      new Date() > account.refreshTokenExpires
    ) {
      await revokeSession(account);
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      });
    }

    const match = matchRefreshToken(account, refreshToken);

    if (match === "mismatch") {
      // Token hợp lệ về chữ ký nhưng không phải token hiện hành ⇒ bản sao cũ
      // đang được dùng lại. Thu hồi cả phiên thay vì chỉ từ chối request này.
      logger.warn(`Refresh token reuse detected for account ${account._id}`);
      await revokeSession(account);
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        code: "TOKEN_REUSE",
        message: "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.",
      });
    }

    req.accountID = decoded._id;
    req.user = decoded;
    req.account = account;
    req.refreshTokenMatch = match;

    next();
  } catch (error) {
    logger.error(`Refresh token verification error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  verifyAccessToken,
  verifyRefreshToken,
};
