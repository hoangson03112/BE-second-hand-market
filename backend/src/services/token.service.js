const crypto = require("crypto");

const GenerateAccessToken = require("../utils/GenerateAccessToken");
const GenerateRefreshToken = require("../utils/GenerateRefreshToken");
const { setAuthCookies } = require("../utils/cookieHelper");

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // trượt theo mỗi lần refresh
const ABSOLUTE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // trần tuyệt đối, không gia hạn

/**
 * Sau khi xoay vòng, refresh token cũ vẫn được chấp nhận thêm một khoảng ngắn.
 * Không có cửa sổ này thì hai tab cùng refresh trong một khoảnh khắc sẽ khiến
 * tab chậm hơn bị coi là "dùng lại token đã xoay" và đăng xuất oan cả phiên.
 */
const ROTATION_GRACE_MS = 60 * 1000;

/**
 * Refresh token là chuỗi ngẫu nhiên entropy cao (JWT ký bởi server) chứ không
 * phải mật khẩu người dùng đặt, nên SHA-256 là đủ và nhanh — bcrypt chỉ cần
 * thiết khi phải chống brute-force mật khẩu yếu, và sẽ tốn CPU vô ích khi mỗi
 * người dùng refresh 15 phút một lần.
 */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Cấp một phiên mới và set cookie.
 *
 * @param {boolean} options.rotate  true khi gọi từ /auth/refresh: giữ lại token
 *   cũ trong cửa sổ ân hạn và KHÔNG gia hạn trần tuyệt đối.
 */
async function issueSession(res, account, { rotate = false } = {}) {
  const accessToken = GenerateAccessToken(account._id);
  const refreshToken = GenerateRefreshToken(account._id);

  if (rotate) {
    account.previousRefreshTokenHash = account.refreshTokenHash;
    account.previousRefreshTokenExpires = new Date(
      Date.now() + ROTATION_GRACE_MS,
    );
  } else {
    // Đăng nhập mới ⇒ phiên mới hoàn toàn.
    account.previousRefreshTokenHash = undefined;
    account.previousRefreshTokenExpires = undefined;
    account.refreshTokenAbsoluteExpires = new Date(
      Date.now() + ABSOLUTE_SESSION_TTL_MS,
    );
    account.loginAttempts = 0;
    account.lockUntil = undefined;
  }

  account.refreshTokenHash = hashToken(refreshToken);
  account.refreshTokenExpires = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  account.lastLogin = new Date();
  await account.save();

  setAuthCookies(res, { accessToken, refreshToken });

  return { accessToken, refreshToken };
}

/** Thu hồi phiên trong DB (đăng xuất, đổi mật khẩu, phát hiện token bị dùng lại). */
async function revokeSession(account) {
  if (!account) return;

  account.refreshTokenHash = undefined;
  account.refreshTokenExpires = undefined;
  account.refreshTokenAbsoluteExpires = undefined;
  account.previousRefreshTokenHash = undefined;
  account.previousRefreshTokenExpires = undefined;
  await account.save();
}

/**
 * Đối chiếu refresh token nhận được với bản lưu trong DB.
 * @returns {"current"|"grace"|"mismatch"}
 */
function matchRefreshToken(account, refreshToken) {
  const incoming = hashToken(refreshToken);

  if (
    account.refreshTokenHash &&
    timingSafeEqual(account.refreshTokenHash, incoming)
  ) {
    return "current";
  }

  if (
    account.previousRefreshTokenHash &&
    timingSafeEqual(account.previousRefreshTokenHash, incoming) &&
    account.previousRefreshTokenExpires &&
    new Date() <= account.previousRefreshTokenExpires
  ) {
    return "grace";
  }

  return "mismatch";
}

module.exports = {
  issueSession,
  revokeSession,
  matchRefreshToken,
  hashToken,
  REFRESH_TOKEN_TTL_MS,
  ABSOLUTE_SESSION_TTL_MS,
  ROTATION_GRACE_MS,
};
