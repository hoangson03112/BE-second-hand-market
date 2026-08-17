/**
 * Cấu hình cookie xác thực dùng chung cho toàn bộ luồng auth.
 *
 * Kiến trúc: FE (www.example.com) và BE (api.example.com) cùng registrable
 * domain ⇒ cookie là same-site. Đặt COOKIE_DOMAIN=".example.com" ở production
 * để cả hai subdomain cùng đọc được; ở local để trống (host-only trên
 * "localhost", cookie không phân biệt cổng nên FE:3000 vẫn dùng chung với
 * BE:2000).
 *
 * Vì sao SameSite=Lax mà không phải Strict:
 *  - Lax đã chặn CSRF cho mọi request đổi trạng thái (POST/PUT/DELETE cross-site
 *    không được gửi kèm cookie).
 *  - Strict còn chặn cả điều hướng top-level đến từ site khác: người dùng bấm
 *    link trong email tới /orders sẽ KHÔNG được gửi cookie ⇒ bị đá về trang
 *    đăng nhập dù phiên còn sống. Đó là lỗ hổng UX, không phải bảo mật thêm.
 */

const isProduction = process.env.NODE_ENV === "production";

/** VD: ".ecomarket.vn". Để trống ở local. */
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 phút
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 ngày

function baseOptions() {
  return {
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  };
}

/**
 * Set toàn bộ cookie của một phiên. Luôn dùng hàm này thay vì res.cookie thủ
 * công để hai cookie không bao giờ lệch nhau.
 *
 * Cả hai đều httpOnly — JavaScript trong trình duyệt không đọc được. Phía Next
 * vẫn kiểm tra được phiên vì middleware và server component nhận nguyên header
 * Cookie của request; httpOnly chỉ chặn `document.cookie`, không chặn server.
 */
function setAuthCookies(res, { accessToken, refreshToken }) {
  const base = baseOptions();

  res.cookie("accessToken", accessToken, {
    ...base,
    httpOnly: true,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });

  if (refreshToken) {
    res.cookie("refreshToken", refreshToken, {
      ...base,
      httpOnly: true,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
  }
}

/** Xoá sạch cookie xác thực (đăng xuất, phiên hết hạn, đổi mật khẩu...). */
function clearAuthCookies(res) {
  const base = baseOptions();

  res.clearCookie("accessToken", { ...base, httpOnly: true });
  res.clearCookie("refreshToken", { ...base, httpOnly: true });
}

module.exports = {
  setAuthCookies,
  clearAuthCookies,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_MAX_AGE,
};
