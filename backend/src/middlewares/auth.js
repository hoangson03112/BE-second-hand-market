const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const { clearAuthCookies } = require("../utils/cookieHelper");
const {
  matchRefreshToken,
  revokeSession,
  findRefreshToken,
} = require("../services/token.service");

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
 * Mỗi lần đăng nhập là một bản ghi riêng trong `account.refreshTokens`, tra
 * bằng claim `jti` của chính token. Mọi kiểm tra dưới đây đều ở phạm vi MỘT
 * bản ghi — token này hết hạn hay bị nghi ngờ thì các lần đăng nhập khác của
 * cùng tài khoản không liên quan.
 *
 * Quy tắc:
 *  - Token phải khớp HASH đang lưu (hoặc hash vừa bị xoay vòng, trong cửa sổ
 *    ân hạn) — không so sánh chuỗi thô.
 *  - Không khớp ⇒ bản sao cũ đang bị dùng lại (có thể đã bị đánh cắp)
 *    ⇒ thu hồi RIÊNG token đó.
 *  - Quá hạn tuyệt đối ⇒ buộc đăng nhập lại, không gia hạn thêm.
 *  - Tài khoản bị khoá ⇒ thu hồi TẤT CẢ token.
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
    const account = await Account.findById(decoded._id).select("+refreshTokens");

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

    // Không tìm thấy bản ghi: đã bị thu hồi (đăng xuất, đổi mật khẩu), đã bị
    // dọn vì hết hạn, hoặc token phát hành trước khi chuyển sang mảng nên
    // không mang jti. Không có gì để thu hồi thêm.
    const entry = findRefreshToken(account, decoded.jti);
    if (!entry) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      });
    }

    // Trần tuyệt đối: dù refresh liên tục cũng không sống quá 30 ngày.
    if (entry.absoluteExpires && new Date() > entry.absoluteExpires) {
      await revokeSession(account, entry.jti);
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
        code: "ABSOLUTE_EXPIRATION",
      });
    }

    if (!entry.expires || new Date() > entry.expires) {
      await revokeSession(account, entry.jti);
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      });
    }

    const match = matchRefreshToken(entry, refreshToken);

    if (match === "mismatch") {
      // Chữ ký hợp lệ nhưng không phải token hiện hành ⇒ bản sao cũ đang được
      // dùng lại. Thu hồi riêng token đó; các lần đăng nhập khác của cùng tài
      // khoản không bị ảnh hưởng.
      logger.warn(
        `Refresh token reuse detected for account ${account._id} jti ${entry.jti}`,
      );
      await revokeSession(account, entry.jti);
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
    req.refreshTokenEntry = entry;
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
