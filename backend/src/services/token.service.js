const crypto = require("crypto");

const Account = require("../models/Account");
const GenerateAccessToken = require("../utils/GenerateAccessToken");
const GenerateRefreshToken = require("../utils/GenerateRefreshToken");
const { setAuthCookies } = require("../utils/cookieHelper");

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // trượt theo mỗi lần refresh
const ABSOLUTE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // trần tuyệt đối, không gia hạn

/**
 * Sau khi xoay vòng, refresh token cũ vẫn được chấp nhận thêm một khoảng ngắn.
 * Không có cửa sổ này thì hai tab cùng refresh trong một khoảnh khắc sẽ khiến
 * tab chậm hơn bị coi là "dùng lại token đã xoay" và đăng xuất oan.
 */
const ROTATION_GRACE_MS = 60 * 1000;

/**
 * Trần số refresh token song song. Không nhằm giới hạn số lần đăng nhập —
 * token hết hạn được dọn mỗi lần đăng nhập nên người dùng thật không chạm tới.
 * Nó chỉ chặn mảng phình vô hạn trong document (script đăng nhập lặp, bot...).
 */
const MAX_REFRESH_TOKENS = 20;

/**
 * Refresh token là chuỗi entropy cao do server ký chứ không phải mật khẩu
 * người dùng đặt, nên SHA-256 là đủ và nhanh — bcrypt chỉ cần thiết khi phải
 * chống brute-force mật khẩu yếu, và sẽ tốn CPU vô ích khi mỗi người dùng
 * refresh 15 phút một lần.
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

function newTokenId() {
  return crypto.randomBytes(16).toString("hex");
}

/** Tìm bản ghi refresh token theo claim `jti` lấy từ chính token đó. */
function findRefreshToken(account, jti) {
  if (!jti || !Array.isArray(account?.refreshTokens)) return null;
  return account.refreshTokens.find((entry) => entry.jti === jti) || null;
}

/**
 * Cấp token và set cookie.
 *
 * Mọi thao tác lên `refreshTokens` đều đi qua updateOne nguyên tử, KHÔNG sửa
 * trực tiếp trên document: trường này khai báo select:false nên phần lớn nơi
 * gọi hàm này nạp account mà không có nó — và thao tác nguyên tử cũng tránh
 * được việc hai lần đăng nhập đồng thời ghi đè lẫn nhau.
 *
 * @param {boolean} options.rotate    true khi gọi từ /auth/refresh.
 * @param {string}  options.jti       Token cần xoay vòng (bắt buộc khi rotate).
 * @param {string}  options.prevHash  Hash hiện hành của token đó, để giữ lại
 *   trong cửa sổ ân hạn.
 */
async function issueSession(res, account, { rotate = false, jti, prevHash } = {}) {
  if (rotate && !jti) {
    throw new Error("issueSession: xoay vòng cần jti");
  }

  const now = Date.now();
  const tokenId = rotate ? jti : newTokenId();

  const accessToken = GenerateAccessToken(account._id);
  const refreshToken = GenerateRefreshToken(account._id, tokenId);
  const hash = hashToken(refreshToken);

  if (rotate) {
    // Chỉ đụng đúng một phần tử; các lần đăng nhập khác giữ nguyên token.
    await Account.updateOne(
      { _id: account._id },
      {
        $set: {
          "refreshTokens.$[t].hash": hash,
          "refreshTokens.$[t].prevHash": prevHash,
          "refreshTokens.$[t].prevExpires": new Date(now + ROTATION_GRACE_MS),
          "refreshTokens.$[t].expires": new Date(now + REFRESH_TOKEN_TTL_MS),
        },
      },
      { arrayFilters: [{ "t.jti": tokenId }] },
    );
  } else {
    // Đăng nhập mới: dọn token đã hết hạn trước, rồi thêm token vừa cấp.
    await Account.updateOne(
      { _id: account._id },
      { $pull: { refreshTokens: { expires: { $lte: new Date(now) } } } },
    );

    await Account.updateOne(
      { _id: account._id },
      {
        $push: {
          refreshTokens: {
            $each: [
              {
                jti: tokenId,
                hash,
                expires: new Date(now + REFRESH_TOKEN_TTL_MS),
                absoluteExpires: new Date(now + ABSOLUTE_SESSION_TTL_MS),
              },
            ],
            // Giữ MAX_REFRESH_TOKENS phần tử cuối ⇒ cũ nhất bị đẩy ra trước.
            $slice: -MAX_REFRESH_TOKENS,
          },
        },
      },
    );

    account.loginAttempts = 0;
    account.lockUntil = undefined;
  }

  account.lastLogin = new Date(now);
  await account.save();

  setAuthCookies(res, { accessToken, refreshToken });

  return { accessToken, refreshToken, jti: tokenId };
}

/**
 * Thu hồi refresh token trong DB.
 *
 * @param {string} [jti]  Chỉ thu hồi token này (đăng xuất, phát hiện token bị
 *   dùng lại). Bỏ trống ⇒ thu hồi TOÀN BỘ (đổi mật khẩu, khoá tài khoản).
 */
async function revokeSession(account, jti) {
  if (!account) return;

  if (jti) {
    await Account.updateOne(
      { _id: account._id },
      { $pull: { refreshTokens: { jti } } },
    );
    return;
  }

  await Account.updateOne({ _id: account._id }, { $set: { refreshTokens: [] } });
}

/**
 * Đối chiếu token nhận được với bản ghi tương ứng trong DB.
 * @returns {"current"|"grace"|"mismatch"}
 */
function matchRefreshToken(entry, refreshToken) {
  if (!entry) return "mismatch";

  const incoming = hashToken(refreshToken);

  if (entry.hash && timingSafeEqual(entry.hash, incoming)) {
    return "current";
  }

  if (
    entry.prevHash &&
    timingSafeEqual(entry.prevHash, incoming) &&
    entry.prevExpires &&
    new Date() <= entry.prevExpires
  ) {
    return "grace";
  }

  return "mismatch";
}

module.exports = {
  issueSession,
  revokeSession,
  matchRefreshToken,
  findRefreshToken,
  hashToken,
  REFRESH_TOKEN_TTL_MS,
  ABSOLUTE_SESSION_TTL_MS,
  ROTATION_GRACE_MS,
  MAX_REFRESH_TOKENS,
};
