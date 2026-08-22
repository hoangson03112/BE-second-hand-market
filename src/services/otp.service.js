const crypto = require("crypto");
const { getRedisService } = require("../config/redis");
const logger = require("../utils/logger");

/**
 * Kho OTP xác minh email cho luồng đăng ký thường, đặt hoàn toàn trong Redis.
 *
 * Chỉ luồng email/mật khẩu mới cần mã này. Đăng nhập/đăng ký bằng Google không
 * đi qua đây: Google đã xác minh email hộ nên googleCallback phát session luôn.
 *
 * Vì sao không lưu MongoDB: hạn của mã chính là TTL của key, Redis tự xoá nên
 * không cần field expiry, không cần cron dọn mã cũ, và mã thô không nằm lại
 * trong collection accounts sau khi đã dùng.
 *
 * File giữ hai thứ: bản thân mã OTP (khoá theo accountId) và ticket xác minh
 * (handle mờ đục client dùng để trỏ tới account mà không biết accountId).
 */

const OTP_TTL_SECONDS = 10 * 60;
const OTP_TTL_MINUTES = OTP_TTL_SECONDS / 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_VERIFY_ATTEMPTS = 5;

// Ticket sống lâu hơn mã để người dùng xin lại mã vài lần mà không mất phiên.
// Bản thân nó vô dụng nếu không có mã trong hộp thư, nên 30 phút là an toàn.
const TICKET_TTL_SECONDS = 30 * 60;
const TICKET_PREFIX = "vt_";
// 32 byte base64url = 43 ký tự. Khớp đúng dạng trước khi ghép vào tên key để
// client không tự chọn được key mình muốn đọc.
const TICKET_PATTERN = /^vt_[A-Za-z0-9_-]{43}$/;

const codeKey = (id) => `otp:email:code:${id}`;
const attemptsKey = (id) => `otp:email:attempts:${id}`;
const cooldownKey = (id) => `otp:email:cooldown:${id}`;
const ticketKey = (token) => `otp:email:ticket:${token}`;

// Math.random() không phải nguồn ngẫu nhiên an toàn — biết vài mã là suy ra
// được mã kế tiếp. OTP thì phải lấy từ crypto.
function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

/** Số giây còn phải chờ mới được xin mã mới. 0 nghĩa là gửi được ngay. */
async function getResendCooldown(accountId) {
  const remaining = await getRedisService().ttl(cooldownKey(String(accountId)));
  return remaining > 0 ? remaining : 0;
}

/**
 * Sinh mã mới, ghi vào Redis kèm TTL, xoá bộ đếm nhập sai và bật cooldown.
 *
 * Trả về null nếu không ghi được. Caller PHẢI không gửi email trong trường hợp
 * đó: mã đã ra khỏi hệ thống mà server không còn gì để đối chiếu.
 */
async function issueCode(accountId) {
  const redis = getRedisService();
  const id = String(accountId);
  const code = generateCode();

  // Bọc trong object thay vì lưu chuỗi trần: wrapper get() có JSON.parse nên
  // "123456" sẽ quay về dạng number và so sánh với chuỗi người dùng nhập sẽ
  // lệch kiểu.
  const stored = await redis.set(codeKey(id), { code }, OTP_TTL_SECONDS);
  if (!stored) {
    logger.error(`OTP: không lưu được mã cho account ${id}`);
    return null;
  }

  await Promise.all([
    redis.del(attemptsKey(id)),
    redis.set(cooldownKey(id), "1", RESEND_COOLDOWN_SECONDS),
  ]);

  return {
    code,
    ttlSeconds: OTP_TTL_SECONDS,
    ttlMinutes: OTP_TTL_MINUTES,
    retryAfterSeconds: RESEND_COOLDOWN_SECONDS,
  };
}

/**
 * Đối chiếu mã người dùng nhập.
 *
 * @returns {Promise<{ok: true}
 *   | {ok: false, reason: "expired"}
 *   | {ok: false, reason: "invalid"|"exhausted", attemptsLeft: number}>}
 */
async function verifyCode(accountId, input) {
  const redis = getRedisService();
  const id = String(accountId);

  const entry = await redis.get(codeKey(id));
  // Gộp ba trường hợp vào "expired": key hết TTL, chưa từng phát mã, và mã đã
  // bị vô hiệu vì nhập sai quá nhiều. Cách xử lý của cả ba đều là xin mã mới.
  if (!entry || !entry.code) return { ok: false, reason: "expired" };

  if (String(entry.code) !== String(input ?? "").trim()) {
    // INCR là atomic nên nhiều request song song không cùng đọc ra một giá trị
    // rồi cùng ghi lại — đếm sai chỗ này là mở đường dò mã không giới hạn.
    const attempts = await redis.increment(attemptsKey(id));
    // INCR tạo key mới không kèm TTL, phải tự đặt hạn kẻo key sống mãi.
    await redis.expire(attemptsKey(id), OTP_TTL_SECONDS);

    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      // Vô hiệu mã thay vì khoá tài khoản: người dùng thật chỉ cần xin mã mới,
      // còn kẻ dò mã mất toàn bộ tiến trình đã đoán.
      await clearCode(id);
      return { ok: false, reason: "exhausted", attemptsLeft: 0 };
    }

    return {
      ok: false,
      reason: "invalid",
      attemptsLeft: Math.max(0, MAX_VERIFY_ATTEMPTS - attempts),
    };
  }

  // Mã chỉ dùng một lần: xoá ngay để không xác minh lại được bằng mã cũ.
  await clearCode(id);
  return { ok: true };
}

/**
 * Phát ticket xác minh: một handle mờ đục trỏ tới accountId, để client không
 * bao giờ nhìn thấy khoá chính. Không có nó thì endpoint verify/resend phải
 * nhận id do client tự chọn — mở đường cho IDOR (dội mail vào hộp thư người
 * khác) và dò id (ObjectId xếp gần nhau nên đoán id lân cận rất dễ).
 *
 * Trả về null nếu không ghi được.
 */
async function issueTicket(accountId) {
  const token = TICKET_PREFIX + crypto.randomBytes(32).toString("base64url");
  const stored = await getRedisService().set(
    ticketKey(token),
    { accountId: String(accountId) },
    TICKET_TTL_SECONDS,
  );

  if (!stored) {
    logger.error(`OTP: không lưu được ticket cho account ${accountId}`);
    return null;
  }
  return token;
}

/** Đổi ticket lấy accountId. null nếu ticket sai dạng, hết hạn, hoặc đã dùng. */
async function resolveTicket(token) {
  if (typeof token !== "string" || !TICKET_PATTERN.test(token)) return null;

  const entry = await getRedisService().get(ticketKey(token));
  return entry?.accountId || null;
}

/** Gia hạn ticket khi phát mã mới, để phiên không chết giữa lúc đang thao tác. */
async function refreshTicket(token) {
  if (typeof token !== "string" || !TICKET_PATTERN.test(token)) return false;
  return getRedisService().expire(ticketKey(token), TICKET_TTL_SECONDS);
}

/** Thu hồi ticket sau khi xác minh xong — dùng một lần. */
async function revokeTicket(token) {
  if (typeof token !== "string" || !TICKET_PATTERN.test(token)) return false;
  return getRedisService().del(ticketKey(token));
}

async function clearCode(accountId) {
  const redis = getRedisService();
  const id = String(accountId);
  await Promise.all([redis.del(codeKey(id)), redis.del(attemptsKey(id))]);
}

/**
 * Gỡ cooldown khi gửi mail thất bại — bắt người dùng chờ 60 giây cho một mã
 * chưa ai nhận được là vô nghĩa.
 */
async function clearResendCooldown(accountId) {
  await getRedisService().del(cooldownKey(String(accountId)));
}

module.exports = {
  OTP_TTL_SECONDS,
  OTP_TTL_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  MAX_VERIFY_ATTEMPTS,
  TICKET_TTL_SECONDS,
  issueCode,
  verifyCode,
  clearCode,
  getResendCooldown,
  clearResendCooldown,
  issueTicket,
  resolveTicket,
  refreshTicket,
  revokeTicket,
};
