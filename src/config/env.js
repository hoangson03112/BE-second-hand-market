require("dotenv").config();

/**
 * Cấu hình ứng dụng — được validate ngay lúc boot.
 *
 * Nguyên tắc: KHÔNG bao giờ đặt giá trị mặc định cho secret hoặc chuỗi kết nối.
 * Thiếu biến bắt buộc thì process phải chết ngay với thông báo rõ ràng, thay vì
 * chạy tiếp bằng một giá trị giả rồi hỏng ở đâu đó giữa production.
 */

const isProduction = process.env.NODE_ENV === "production";

/** Trả về giá trị đầu tiên khác rỗng trong danh sách key. */
function firstDefined(keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

/**
 * Biến bắt buộc. `keys` nhiều phần tử nghĩa là chỉ cần một trong số đó
 * (ví dụ CORS_ORIGIN hoặc CLIENT_URL đều được).
 */
const REQUIRED = [
  {
    keys: ["MONGODB_URI"],
    hint: "Chuỗi kết nối MongoDB, ví dụ mongodb+srv://user:pass@cluster/eco-market",
  },
  {
    keys: ["JWT_ACCESS_SECRET"],
    hint: "Chuỗi ngẫu nhiên >= 32 ký tự dùng ký access token",
  },
  {
    keys: ["JWT_REFRESH_SECRET"],
    hint: "Chuỗi ngẫu nhiên >= 32 ký tự, PHẢI khác JWT_ACCESS_SECRET",
  },
  {
    keys: ["CORS_ORIGIN", "CLIENT_URL"],
    hint: "Danh sách origin được phép, phân tách bằng dấu phẩy. Không dùng '*' vì API gửi cookie",
  },
  {
    keys: ["FRONTEND_URL", "CLIENT_URL"],
    hint: "URL gốc của frontend, dùng cho link xác thực email và redirect OAuth",
  },
];

/**
 * Nhóm theo tính năng: thiếu thì tính năng đó không dùng được, nhưng app vẫn
 * chạy. Cảnh báo thay vì chặn boot.
 */
const FEATURE_GROUPS = [
  { name: "Upload ảnh (Cloudinary)", keys: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] },
  { name: "Gửi email (Brevo)", keys: ["BREVO_API_KEY", "MAIL_FROM_EMAIL"] },
  { name: "Đăng nhập Google", keys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] },
  { name: "Vận chuyển GHN", keys: ["GHN_TOKEN", "GHN_SHOP_ID"] },
  { name: "Tìm kiếm Meilisearch", keys: ["MEILI_HOST", "MEILI_MASTER_KEY"] },
  { name: "Kiểm duyệt AI", keys: ["GOOGLE_AI_KEY"] },
];

/** Giá trị placeholder hay bị quên thay khi copy từ .env.example. */
const PLACEHOLDER_SECRETS = new Set([
  "your-secret-key",
  "secret",
  "changeme",
  "change-me",
  "todo",
  "xxx",
]);

function validateEnv() {
  const missing = [];
  for (const rule of REQUIRED) {
    if (!firstDefined(rule.keys)) missing.push(rule);
  }

  const problems = [];

  // Secret yếu chỉ chặn ở production — dev vẫn cho chạy để đỡ vướng.
  if (isProduction) {
    for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]) {
      const value = process.env[key];
      if (!value) continue;
      if (PLACEHOLDER_SECRETS.has(value.toLowerCase())) {
        problems.push(`${key} đang là giá trị placeholder — phải thay bằng chuỗi ngẫu nhiên`);
      } else if (value.length < 32) {
        problems.push(`${key} chỉ dài ${value.length} ký tự — cần tối thiểu 32`);
      }
    }

    if (
      process.env.JWT_ACCESS_SECRET &&
      process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET
    ) {
      problems.push(
        "JWT_ACCESS_SECRET và JWT_REFRESH_SECRET đang trùng nhau — access token bị dùng thay refresh token được",
      );
    }

    const origins = firstDefined(["CORS_ORIGIN", "CLIENT_URL"]);
    if (origins && origins.split(",").some((o) => o.trim() === "*")) {
      problems.push("CORS_ORIGIN không được chứa '*' vì API dùng cookie credentials");
    }
  }

  if (missing.length === 0 && problems.length === 0) return;

  const lines = ["", "❌ Cấu hình môi trường không hợp lệ — dừng khởi động.", ""];

  if (missing.length > 0) {
    lines.push("  Thiếu biến bắt buộc:");
    for (const rule of missing) {
      lines.push(`    • ${rule.keys.join(" hoặc ")}`);
      lines.push(`      ${rule.hint}`);
    }
    lines.push("");
  }

  if (problems.length > 0) {
    lines.push("  Giá trị không an toàn:");
    for (const p of problems) lines.push(`    • ${p}`);
    lines.push("");
  }

  lines.push("  Xem backend/.env.example để biết danh sách đầy đủ.");
  lines.push("  Sinh secret: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"");
  lines.push("");

  // Dùng console trực tiếp: logger có thể chưa sẵn sàng ở thời điểm này.
  console.error(lines.join("\n"));
  process.exit(1);
}

function warnDisabledFeatures() {
  for (const group of FEATURE_GROUPS) {
    const missing = group.keys.filter((k) => !firstDefined([k]));
    if (missing.length > 0) {
      console.warn(`⚠️  ${group.name} sẽ không hoạt động — thiếu: ${missing.join(", ")}`);
    }
  }
}

validateEnv();
warnDisabledFeatures();

const mongoUri = firstDefined(["MONGODB_URI"]);

const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction,

  // `mongoURL` là tên mà src/models/indexes.js đang đọc; giữ cả hai để không
  // phải sửa call site, nhưng chỉ có một nguồn giá trị.
  mongoURL: mongoUri,
  database: { uri: mongoUri },

  jwt: {
    accessSecret: firstDefined(["JWT_ACCESS_SECRET"]),
    refreshSecret: firstDefined(["JWT_REFRESH_SECRET"]),
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },

  cors: {
    origin: firstDefined(["CORS_ORIGIN", "CLIENT_URL"]),
    credentials: true,
  },

  frontendUrl: firstDefined(["FRONTEND_URL", "CLIENT_URL"]),

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  upload: {
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 10,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },
};

module.exports = config;
