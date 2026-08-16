require("dotenv").config();
const SibApiV3Sdk = require("sib-api-v3-sdk");
const client = SibApiV3Sdk.ApiClient.instance;
client.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

/* ══════════════════════════════════════════════════════════════════════════
   DESIGN SYSTEM — đồng bộ với web app (src/styles/tokens.css)

   Ngôn ngữ: editorial quiet-luxury. Ivory / ink / champagne, điểm xuyết
   accent xanh. Góc 2px, đường kẻ hairline, không đổ bóng, không gradient,
   không emoji. Tiêu đề dùng serif, nhãn phụ viết hoa giãn chữ.

   Ràng buộc riêng của email: không flexbox, không grid, không backdrop-filter,
   không rgba() (Outlook bỏ qua) — mọi bố cục đều bằng <table>.
   ══════════════════════════════════════════════════════════════════════════ */

const T = {
  ink: "#1A1816", // --luxury-ink
  ivory: "#F7F5F0", // --luxury-ivory
  cream: "#FEFCF9", // --cream-50
  white: "#FFFFFF",
  champagne: "#C4A574", // --luxury-champagne
  accent: "#5FB160", // --accent
  accentDeep: "#336D3E", // --taupe-700
  text: "#4F4F5A", // --charcoal-600
  muted: "#7D7D89", // --charcoal-400
  rule: "#E3E0DA", // ink @ 10% trên nền ivory
  ruleCool: "#E5E5E8", // --charcoal-100
  danger: "#B91C1C", // --error-dark
  dangerRule: "#EF4444", // --error
  onInkMuted: "#94928E" // ivory @ 55% trên nền ink
};

/*
  Web dùng Droid Serif (tiêu đề) + Geist (nội dung); email client không có sẵn
  font nào trong hai. Xử lý theo hai tầng:

  · Tải webfont từ Google Fonts — Noto Serif chính là hậu thân của Droid Serif
    (cùng tác giả Steve Matteson), Inter là họ hàng gần của Geist. Apple Mail,
    iOS Mail, Samsung Mail dựng đúng font này.
  · Client không hỗ trợ webfont (Gmail, Outlook) rơi về Georgia / Segoe UI.

  Riêng CHỮ SỐ luôn đi bằng sans — xem numeric() bên dưới.
*/
const FONT_SANS =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONT_SERIF = "'Noto Serif', Georgia, 'Times New Roman', Times, serif";
const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Serif:wght@400&display=swap";

/**
 * Chữ số dùng sans + tabular figures. Lý do: Georgia — bản dự phòng của phần
 * lớn client — chỉ có old-style figures, tức 3/4/5/7/9 thò xuống dưới baseline
 * còn 6/8 nhô lên. Mã OTP và số tiền vì thế trông gãy hàng, cao thấp lộn xộn.
 */
const numeric = (extra = "") =>
  `font-family:${FONT_SANS};font-variant-numeric:tabular-nums lining-nums;${extra}`;

/* Logo tô ivory và bẹt sẵn lên nền ink qua Cloudinary — không phụ thuộc kênh
   alpha (một số client dựng PNG trong suốt trên nền trắng) và không cần
   CSS filter (Gmail loại bỏ). Ảnh @2x: 300×131, hiển thị 150×65. */
const LOGO_ON_INK =
  "https://res.cloudinary.com/dqvtj4uxo/image/upload/e_colorize:100,co_rgb:F7F5F0,b_rgb:1A1816,w_300,c_fit,f_jpg,q_auto:good/v1784993079/Gemini_Generated_Image_rg4xa9rg4xa9rg4x_1_mtjahn.png";

const APP_URL = () =>
  process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:3000";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@ecomarket.io.vn";
const SENDER = () => ({
  email: process.env.MAIL_FROM_EMAIL || "rtwf0311@gmail.com",
  name: "Eco Market"
});

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
/** Chặn tên sản phẩm / lý do từ chối / tên người dùng làm vỡ HTML. */
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);

const vnd = (amount) => `${Number(amount || 0).toLocaleString("vi-VN")} ₫`;

/** Ảnh sản phẩm có nơi lưu dạng chuỗi, có nơi dạng { url } — nhận cả hai. */
const productImage = (product) => {
  const first = product?.images?.[0];
  return (
    product?.avatar?.url ||
    (typeof first === "string" ? first : first?.url) ||
    null
  );
};

/* ── Nguyên tố dựng hình ──────────────────────────────────────────────── */

const hairline = (color = T.rule, width = "100%") =>
  `<div style="width:${width};height:1px;background-color:${color};font-size:0;line-height:0;">&nbsp;</div>`;

const microLabel = (text, color = T.muted) =>
  `<span style="font-family:${FONT_SANS};font-size:10px;font-weight:700;letter-spacing:2.6px;text-transform:uppercase;color:${color};">${esc(text)}</span>`;

const paragraph = (html, extra = "") =>
  `<p style="margin:0 0 16px;font-family:${FONT_SANS};font-size:15px;line-height:1.75;color:${T.text};${extra}">${html}</p>`;

/** Nhãn champagne + gạch ngang — chữ ký nhận diện lấy từ AuthFormHeader. */
const eyebrow = (text) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="32" style="width:32px;">${hairline(T.champagne, "32px")}</td>
      <td style="padding-left:12px;">${microLabel(text)}</td>
    </tr>
  </table>`;

const heading = (text) =>
  `<h1 class="lux-h1 lux-serif" style="margin:18px 0 0;font-family:${FONT_SERIF};font-size:32px;line-height:1.18;font-weight:400;letter-spacing:-0.5px;color:${T.ink};">${text}</h1>`;

/** Nút bulletproof — nền ink đặc, góc 2px, chữ hoa giãn 2.2px. */
const button = (href, label, { align = "left" } = {}) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${align === "center" ? "margin:0 auto;" : ""}">
    <tr>
      <td bgcolor="${T.ink}" style="border-radius:2px;">
        <a href="${href}" style="display:inline-block;padding:16px 34px;font-family:${FONT_SANS};font-size:11px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;color:${T.ivory};text-decoration:none;">${esc(label)}</a>
      </td>
    </tr>
  </table>`;

/**
 * Khối chú thích — thay cho các hộp màu đặc (emerald / xanh dương / đỏ) của
 * bản cũ. Nền ivory, chỉ một vạch 2px bên trái mang màu ngữ nghĩa.
 */
const callout = ({ label, html, tone = "neutral" }) => {
  const bar = {
    neutral: T.champagne,
    accent: T.accent,
    danger: T.dangerRule
  }[tone];
  const labelColor = { neutral: T.muted, accent: T.accentDeep, danger: T.danger }[
    tone
  ];

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;">
    <tr>
      <td width="2" bgcolor="${bar}" style="width:2px;font-size:0;line-height:0;">&nbsp;</td>
      <td bgcolor="${T.ivory}" style="padding:18px 22px;">
        ${label ? `<div style="margin-bottom:8px;">${microLabel(label, labelColor)}</div>` : ""}
        <div style="font-family:${FONT_SANS};font-size:14px;line-height:1.75;color:${T.text};">${html}</div>
      </td>
    </tr>
  </table>`;
};

/** Bảng nhãn / giá trị ngăn bằng hairline. */
const dataRows = (rows) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;border-top:1px solid ${T.rule};">
    ${rows
      .filter(Boolean)
      .map(
        ({ label, value, emphasis }) => `
    <tr>
      <td style="padding:13px 0;border-bottom:1px solid ${T.rule};font-family:${FONT_SANS};font-size:13px;color:${T.muted};">${esc(label)}</td>
      <td align="right" style="padding:13px 0;border-bottom:1px solid ${T.rule};${numeric()}font-size:${emphasis ? "19px" : "13px"};font-weight:600;letter-spacing:${emphasis ? "-0.2px" : "0"};color:${T.ink};">${esc(value)}</td>
    </tr>`
      )
      .join("")}
  </table>`;

const sectionLabel = (text) =>
  `<div style="margin:34px 0 14px;">${microLabel(text)}</div>`;

const masthead = () => `
  <tr>
    <td bgcolor="${T.ink}" style="padding:30px 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle">
            <a href="${APP_URL()}" style="text-decoration:none;">
              <img
                src="${LOGO_ON_INK}"
                alt="Eco Market"
                width="150"
                height="65"
                style="display:block;width:150px;height:65px;border:0;outline:none;text-decoration:none;font-family:${FONT_SERIF};font-size:22px;color:${T.ivory};"
              />
            </a>
          </td>
          <td align="right" valign="middle" width="32" style="width:32px;">${hairline(T.champagne, "32px")}</td>
        </tr>
      </table>
      <div style="margin-top:16px;">${microLabel("Sàn đồ cũ tuyển chọn", T.onInkMuted)}</div>
    </td>
  </tr>`;

const footer = () => `
  <tr>
    <td bgcolor="${T.cream}" style="padding:32px 40px;border-top:1px solid ${T.rule};">
      <div>${microLabel("Cần hỗ trợ")}</div>
      <p style="margin:10px 0 0;font-family:${FONT_SANS};font-size:13px;line-height:1.7;color:${T.text};">
        <a href="mailto:${SUPPORT_EMAIL}" style="color:${T.ink};text-decoration:none;border-bottom:1px solid ${T.champagne};">${SUPPORT_EMAIL}</a>
      </p>
      <div style="margin:24px 0;">${hairline()}</div>
      <p style="margin:0;font-family:${FONT_SANS};font-size:11px;line-height:1.8;color:${T.muted};">
        © ${new Date().getFullYear()} Eco Market. Bảo lưu mọi quyền.<br />
        Email này được gửi tự động — vui lòng không trả lời.
      </p>
    </td>
  </tr>`;

/** Dòng preview hiện trong danh sách hộp thư, ẩn khỏi nội dung email. */
const preheader = (text) =>
  `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${T.ivory};">${esc(text)}</div>`;

/** Khung tài liệu dùng chung cho toàn bộ template. */
const layout = ({ preview, eyebrow: eyebrowText, title, body }) => `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Eco Market</title>

  <!--[if !mso]><!-->
  <link href="${FONT_URL}" rel="stylesheet" />
  <!--<![endif]-->

  <!--[if mso]>
  <style>
    /* Word engine chỉ đọc font đầu tiên trong stack; gặp webfont lạ nó rơi về
       Times New Roman thay vì font dự phòng kế tiếp. Ép lại tường minh. */
    body, table, td, p, a, span, div, li, ul, h1 { font-family: Arial, Helvetica, sans-serif !important; }
    .lux-serif { font-family: Georgia, 'Times New Roman', serif !important; }
  </style>
  <![endif]-->

  <style>
    @media only screen and (max-width: 620px) {
      .lux-pad { padding-left: 24px !important; padding-right: 24px !important; }
      .lux-h1 { font-size: 26px !important; }
      .lux-code { font-size: 28px !important; letter-spacing: 8px !important; text-indent: 8px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${T.ivory};">
  ${preheader(preview)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${T.ivory};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:${T.white};border:1px solid ${T.rule};border-radius:2px;">
          ${masthead()}
          <tr>
            <td class="lux-pad" style="padding:44px 40px 40px;">
              ${eyebrow(eyebrowText)}
              ${heading(title)}
              <div style="margin-top:22px;">${body}</div>
            </td>
          </tr>
          ${footer()}
        </table>
        <p class="lux-serif" style="margin:20px 0 0;font-family:${FONT_SERIF};font-style:italic;font-size:13px;color:${T.muted};">
          Mua bán thông minh — sống xanh bền vững.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

/* ══════════════════════════════════════════════════════════════════════════
   TEMPLATES
   ══════════════════════════════════════════════════════════════════════════ */

const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendVerificationEmail = async (toEmail, code, expiryMinutes = 10) => {
  try {
    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Mã xác thực tài khoản - Eco Market",
      htmlContent: layout({
        preview: `Mã xác thực của bạn là ${code}, hiệu lực trong ${expiryMinutes} phút.`,
        eyebrow: "Xác thực",
        title: "Kiểm tra<br />hộp thư",
        body: `
          ${paragraph("Nhập mã gồm sáu chữ số dưới đây để hoàn tất xác thực tài khoản Eco Market của bạn.")}

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0;">
            <tr>
              <td bgcolor="${T.ivory}" style="border:1px solid ${T.rule};border-radius:2px;padding:24px 34px;">
                <div class="lux-code" style="${numeric()}font-size:34px;font-weight:500;line-height:1;letter-spacing:12px;text-indent:12px;color:${T.ink};">${esc(code)}</div>
              </td>
            </tr>
          </table>

          ${callout({
            label: "Lưu ý",
            html: `Mã có hiệu lực trong <strong>${expiryMinutes} phút</strong> và chỉ dùng được một lần. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.`
          })}
        `
      })
    });
  } catch (error) {
    console.error("Lỗi gửi email xác thực:", error.response?.body || error);
    throw error;
  }
};

const sendOtpEmail = async (toEmail, otp, expiryMinutes) => {
  return sendVerificationEmail(toEmail, otp, expiryMinutes);
};

const sendAccountBannedEmail = async (toEmail, userName, reason) => {
  if (!toEmail) return;

  try {
    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Tài khoản đã bị khoá - Eco Market",
      htmlContent: layout({
        preview: "Tài khoản Eco Market của bạn đã bị tạm khoá.",
        eyebrow: "Tài khoản",
        title: "Tài khoản<br />đã bị khoá",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(userName || "bạn")}</strong>, tài khoản Eco Market của bạn đã bị tạm khoá sau khi chúng tôi rà soát hoạt động trên nền tảng.`)}

          ${dataRows([
            { label: "Tài khoản", value: toEmail },
            { label: "Thời điểm", value: new Date().toLocaleString("vi-VN") }
          ])}

          ${
            reason
              ? callout({
                  label: "Lý do",
                  tone: "danger",
                  html: esc(reason)
                })
              : ""
          }

          ${callout({
            label: "Khiếu nại",
            html: "Nếu bạn cho rằng đây là nhầm lẫn, hãy đăng nhập vào Eco Market và gửi khiếu nại ngay trên màn hình thông báo khoá. Chúng tôi sẽ xem xét và phản hồi qua email này."
          })}

          <div style="margin:30px 0 0;">
            ${button(APP_URL(), "Gửi khiếu nại")}
          </div>
        `
      })
    });
    console.log("Email account banned đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email account banned:",
      error.response?.body || error
    );
  }
};

const sendAccountUnbannedEmail = async (toEmail, userName) => {
  if (!toEmail) return;

  try {
    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Tài khoản đã được mở khoá - Eco Market",
      htmlContent: layout({
        preview: "Tài khoản Eco Market của bạn đã hoạt động trở lại.",
        eyebrow: "Tài khoản",
        title: "Đã hoạt động<br />trở lại",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(userName || "bạn")}</strong>, tài khoản Eco Market của bạn đã được mở khoá và có thể sử dụng bình thường.`)}

          ${dataRows([
            { label: "Tài khoản", value: toEmail },
            { label: "Thời điểm", value: new Date().toLocaleString("vi-VN") }
          ])}

          ${callout({
            tone: "accent",
            html: "Toàn bộ sản phẩm và đơn hàng của bạn vẫn được giữ nguyên. Cảm ơn bạn đã kiên nhẫn chờ chúng tôi rà soát."
          })}

          <div style="margin:30px 0 0;">
            ${button(APP_URL(), "Quay lại Eco Market")}
          </div>
        `
      })
    });
    console.log("Email account unbanned đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email account unbanned:",
      error.response?.body || error
    );
  }
};

const sendAppealReceivedToUserEmail = async (toEmail, fullName) => {
  if (!toEmail) return;

  try {
    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Đã nhận khiếu nại của bạn - Eco Market",
      htmlContent: layout({
        preview: "Chúng tôi đã nhận được khiếu nại và đang xem xét.",
        eyebrow: "Khiếu nại",
        title: "Đã nhận<br />khiếu nại",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(fullName || "bạn")}</strong>, chúng tôi đã nhận được khiếu nại của bạn và chuyển tới đội ngũ phụ trách.`)}

          ${dataRows([
            { label: "Tài khoản", value: toEmail },
            { label: "Thời điểm gửi", value: new Date().toLocaleString("vi-VN") },
            { label: "Trạng thái", value: "Đang xem xét" }
          ])}

          ${callout({
            label: "Thời gian xử lý",
            html: "Chúng tôi sẽ rà soát và phản hồi qua chính email này, thường trong vòng <strong>24 đến 48 giờ</strong>. Bạn không cần gửi thêm khiếu nại mới trong thời gian chờ."
          })}
        `
      })
    });
    console.log("Email appeal received đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email appeal received:",
      error.response?.body || error
    );
  }
};

const sendResetPasswordEmail = async (toEmail, resetToken, userName) => {
  try {
    const resetLink = `${APP_URL()}/reset-password?token=${resetToken}`;
    const expiryMinutes = 15;

    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Yêu cầu đặt lại mật khẩu - Eco Market",
      htmlContent: layout({
        preview: `Liên kết đặt lại mật khẩu có hiệu lực trong ${expiryMinutes} phút.`,
        eyebrow: "Bảo mật",
        title: "Đặt lại<br />mật khẩu",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(userName || "bạn")}</strong>, chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.`)}

          <div style="margin:30px 0;">
            ${button(resetLink, "Đặt lại mật khẩu")}
          </div>

          ${callout({
            label: "Hiệu lực",
            html: `Liên kết sẽ hết hạn sau <strong>${expiryMinutes} phút</strong>. Nếu bạn không gửi yêu cầu này, hãy bỏ qua email — mật khẩu hiện tại vẫn được giữ nguyên.`
          })}

          <div style="margin-top:30px;">${hairline()}</div>
          <p style="margin:18px 0 0;font-family:${FONT_SANS};font-size:12px;line-height:1.8;color:${T.muted};">
            Nút không hoạt động? Dán liên kết sau vào trình duyệt:<br />
            <span style="word-break:break-all;color:${T.text};">${esc(resetLink)}</span>
          </p>
        `
      })
    });
    console.log("Email reset password đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email reset password:",
      error.response?.body || error
    );
    throw error;
  }
};

const sendPasswordChangedEmail = async (toEmail, userName) => {
  try {
    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Mật khẩu đã được thay đổi - Eco Market",
      htmlContent: layout({
        preview: "Mật khẩu tài khoản Eco Market của bạn vừa được cập nhật.",
        eyebrow: "Bảo mật",
        title: "Mật khẩu<br />đã cập nhật",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(userName || "bạn")}</strong>, mật khẩu tài khoản Eco Market của bạn đã được thay đổi thành công.`)}

          ${dataRows([
            { label: "Thời điểm", value: new Date().toLocaleString("vi-VN") },
            { label: "Tài khoản", value: toEmail }
          ])}

          ${callout({
            label: "Không phải bạn?",
            tone: "danger",
            html: `Nếu bạn không thực hiện thay đổi này, hãy liên hệ ngay với chúng tôi qua <a href="mailto:${SUPPORT_EMAIL}" style="color:${T.ink};text-decoration:underline;">${SUPPORT_EMAIL}</a> để được hỗ trợ khóa tài khoản.`
          })}
        `
      })
    });
    console.log("Email password changed đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email password changed:",
      error.response?.body || error
    );
    throw error;
  }
};

const sendAccountChangeEmail = async (
  toEmail,
  userName,
  changeType,
  newValue
) => {
  try {
    const typeText = changeType === "email" ? "Email" : "Số điện thoại";

    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: `Thay đổi ${typeText} - Eco Market`,
      htmlContent: layout({
        preview: `${typeText} tài khoản của bạn đã được cập nhật.`,
        eyebrow: "Tài khoản",
        title: "Thông tin<br />đã cập nhật",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(userName || "bạn")}</strong>, ${typeText.toLowerCase()} tài khoản của bạn đã được thay đổi thành công.`)}

          ${dataRows([
            { label: `${typeText} mới`, value: newValue, emphasis: true },
            { label: "Thời điểm", value: new Date().toLocaleString("vi-VN") }
          ])}

          ${callout({
            label: "Không phải bạn?",
            tone: "danger",
            html: `Nếu bạn không thực hiện thay đổi này, hãy liên hệ ngay với chúng tôi qua <a href="mailto:${SUPPORT_EMAIL}" style="color:${T.ink};text-decoration:underline;">${SUPPORT_EMAIL}</a>.`
          })}
        `
      })
    });
    console.log(`Email ${typeText} change đã gửi tới:`, toEmail);
  } catch (error) {
    console.error(`Lỗi gửi email change:`, error.response?.body || error);
    throw error;
  }
};

const sendProductListedEmail = async (toEmail, userName, product) => {
  try {
    const productUrl = `${APP_URL()}/products/${product._id}`;
    const imageUrl = productImage(product);
    const description = product.description
      ? `${product.description.substring(0, 150)}${product.description.length > 150 ? "…" : ""}`
      : null;

    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Sản phẩm đã được đăng - Eco Market",
      htmlContent: layout({
        preview: `"${product.name}" đã lên sàn Eco Market.`,
        eyebrow: "Đăng bán",
        title: "Sản phẩm<br />đã lên sàn",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(userName || "bạn")}</strong>, sản phẩm của bạn đã được đăng thành công trên Eco Market.`)}

          ${
            imageUrl
              ? `<img src="${esc(imageUrl)}" alt="${esc(product.name)}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:1px solid ${T.rule};border-radius:2px;margin:28px 0 0;" />`
              : ""
          }

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;">
            <tr>
              <td bgcolor="${T.ivory}" style="padding:24px;border:1px solid ${T.rule};border-radius:2px;">
                <div class="lux-serif" style="font-family:${FONT_SERIF};font-size:19px;line-height:1.35;color:${T.ink};">${esc(product.name)}</div>
                <div style="margin-top:10px;${numeric()}font-size:23px;font-weight:600;letter-spacing:-0.3px;color:${T.ink};">${vnd(product.price)}</div>
                ${description ? `<p style="margin:14px 0 0;font-family:${FONT_SANS};font-size:13px;line-height:1.7;color:${T.text};">${esc(description)}</p>` : ""}
              </td>
            </tr>
          </table>

          <div style="margin:30px 0;">
            ${button(productUrl, "Xem sản phẩm")}
          </div>

          ${callout({
            label: "Mẹo bán hàng",
            tone: "accent",
            html: `
              <ul style="margin:0;padding-left:18px;">
                <li style="margin-bottom:6px;">Ảnh sáng, rõ nét và chụp đủ các góc</li>
                <li style="margin-bottom:6px;">Mô tả trung thực tình trạng và khuyết điểm</li>
                <li>Phản hồi người mua trong vòng vài giờ</li>
              </ul>`
          })}
        `
      })
    });
    console.log("Email product listed đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email product listed:",
      error.response?.body || error
    );
    throw error;
  }
};

const sendProductApprovedEmail = async (toEmail, userName, product) => {
  try {
    const productUrl = `${APP_URL()}/products/${product._id}`;

    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Sản phẩm đã được duyệt - Eco Market",
      htmlContent: layout({
        preview: `"${product.name}" đã qua kiểm duyệt và đang hiển thị công khai.`,
        eyebrow: "Kiểm duyệt",
        title: "Đã được<br />duyệt",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(userName || "bạn")}</strong>, sản phẩm của bạn đã qua kiểm duyệt và hiện đang hiển thị trên Eco Market.`)}

          ${dataRows([
            { label: "Sản phẩm", value: product.name },
            { label: "Trạng thái", value: "Đang hiển thị" }
          ])}

          ${callout({
            tone: "accent",
            html: "Sản phẩm của bạn đã sẵn sàng để bán. Hãy chuẩn bị hàng và theo dõi hộp thư để không bỏ lỡ đơn hàng đầu tiên."
          })}

          <div style="margin:30px 0 0;">
            ${button(productUrl, "Xem sản phẩm")}
          </div>
        `
      })
    });
    console.log("Email product approved đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email product approved:",
      error.response?.body || error
    );
    throw error;
  }
};

const sendProductRejectedEmail = async (toEmail, userName, product, reason) => {
  try {
    const sellUrl = `${APP_URL()}/sell`;

    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Sản phẩm chưa được duyệt - Eco Market",
      htmlContent: layout({
        preview: `"${product.name}" chưa đáp ứng tiêu chuẩn đăng bán.`,
        eyebrow: "Kiểm duyệt",
        title: "Chưa được<br />duyệt",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(userName || "bạn")}</strong>, sản phẩm của bạn chưa đáp ứng tiêu chuẩn đăng bán nên tạm thời chưa được hiển thị.`)}

          ${dataRows([{ label: "Sản phẩm", value: product.name }])}

          ${
            reason
              ? callout({
                  label: "Lý do từ chối",
                  tone: "danger",
                  html: esc(reason)
                })
              : ""
          }

          ${callout({
            label: "Bạn có thể làm gì",
            html: `
              <ul style="margin:0;padding-left:18px;">
                <li style="margin-bottom:6px;">Đọc kỹ lý do từ chối ở trên</li>
                <li style="margin-bottom:6px;">Chỉnh sửa tiêu đề, mô tả hoặc hình ảnh</li>
                <li style="margin-bottom:6px;">Đảm bảo sản phẩm không vi phạm chính sách</li>
                <li>Đăng lại sau khi đã cập nhật</li>
              </ul>`
          })}

          <div style="margin:30px 0 0;">
            ${button(sellUrl, "Đăng lại sản phẩm")}
          </div>
        `
      })
    });
    console.log("Email product rejected đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email product rejected:",
      error.response?.body || error
    );
    throw error;
  }
};

const sendProductUnderReviewEmail = async (toEmail, userName, product) => {
  try {
    const listingsUrl = `${APP_URL()}/my/listings`;

    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Sản phẩm đang được xem xét - Eco Market",
      htmlContent: layout({
        preview: `"${product.name}" đang chờ đội ngũ kiểm duyệt xem xét.`,
        eyebrow: "Kiểm duyệt",
        title: "Đang được<br />xem xét",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(userName || "bạn")}</strong>, sản phẩm của bạn đang được đội ngũ kiểm duyệt xem xét thủ công.`)}

          ${dataRows([
            { label: "Sản phẩm", value: product.name },
            { label: "Trạng thái", value: "Chờ kiểm duyệt" }
          ])}

          ${callout({
            label: "Thời gian xử lý",
            html: "Thông thường trong vòng <strong>24 giờ</strong>. Bạn sẽ nhận được thông báo ngay khi có kết quả."
          })}

          <div style="margin:30px 0 0;">
            ${button(listingsUrl, "Xem danh sách sản phẩm")}
          </div>
        `
      })
    });
    console.log("Email product under_review đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email product under_review:",
      error.response?.body || error
    );
    throw error;
  }
};

const sendOrderPlacedEmail = async (toEmail, userName, order) => {
  /* notification.service gọi với buyer?.email — có thể undefined. */
  if (!toEmail) return;

  try {
    const orderUrl = `${APP_URL()}/orders/${order._id}`;
    const shortId = String(order._id).slice(-8).toUpperCase();
    const isCOD = order.paymentMethod === "cod";

    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Đặt hàng thành công - Eco Market",
      htmlContent: layout({
        preview: `Đơn #${shortId} đã được tiếp nhận, đang chờ người bán xác nhận.`,
        eyebrow: "Đơn hàng",
        title: "Đặt hàng<br />thành công",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(userName || "bạn")}</strong>, đơn hàng của bạn đã được tiếp nhận và đang chờ người bán xác nhận.`)}

          ${dataRows([
            { label: "Mã đơn hàng", value: `#${shortId}` },
            {
              label: "Phương thức",
              value: isCOD
                ? "COD — thu tiền khi giao"
                : "Chuyển khoản ngân hàng"
            },
            {
              label: "Tổng tiền",
              value: vnd(order.totalAmount),
              emphasis: true
            }
          ])}

          ${callout({
            label: "Tiếp theo",
            tone: "accent",
            html: isCOD
              ? "Bạn sẽ thanh toán khi nhận hàng. Người bán sẽ chuẩn bị và bàn giao đơn cho đơn vị vận chuyển sau khi xác nhận."
              : "Vui lòng chuyển khoản theo thông tin trong đơn hàng và tải lên ảnh xác nhận. Người bán sẽ xử lý đơn ngay khi nhận được thanh toán."
          })}

          <div style="margin:30px 0 0;">
            ${button(orderUrl, "Theo dõi đơn hàng")}
          </div>
        `
      })
    });
    console.log("Email order placed đã gửi tới:", toEmail);
  } catch (error) {
    console.error("Lỗi gửi email order placed:", error.response?.body || error);
  }
};

const sendPaymentSuccessEmail = async (toEmail, userName, order) => {
  try {
    const orderUrl = `${APP_URL()}/orders/${order._id}`;

    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Thanh toán thành công - Eco Market",
      htmlContent: layout({
        preview: `Đơn hàng #${String(order._id).slice(-8).toUpperCase()} đã được thanh toán.`,
        eyebrow: "Thanh toán",
        title: "Thanh toán<br />thành công",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(userName || "bạn")}</strong>, đơn hàng của bạn đã được thanh toán thành công.`)}

          ${dataRows([
            {
              label: "Mã đơn hàng",
              value: `#${String(order._id).slice(-8).toUpperCase()}`
            },
            {
              label: "Phương thức",
              value:
                order.paymentMethod === "cod"
                  ? "COD — thu tiền khi giao"
                  : "Chuyển khoản ngân hàng"
            },
            {
              label: "Tổng thanh toán",
              value: vnd(order.totalAmount),
              emphasis: true
            }
          ])}

          ${callout({
            label: "Tiếp theo",
            tone: "accent",
            html: `
              <ul style="margin:0;padding-left:18px;">
                <li style="margin-bottom:6px;">Người bán chuẩn bị và đóng gói hàng</li>
                <li style="margin-bottom:6px;">Bạn nhận thông báo khi đơn được bàn giao vận chuyển</li>
                <li>Theo dõi tiến trình bất cứ lúc nào qua liên kết bên dưới</li>
              </ul>`
          })}

          <div style="margin:30px 0 0;">
            ${button(orderUrl, "Theo dõi đơn hàng")}
          </div>
        `
      })
    });
    console.log("Email payment success đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email payment success:",
      error.response?.body || error
    );
    throw error;
  }
};

const sendNewOrderToSellerEmail = async (toEmail, sellerName, order, buyer) => {
  try {
    const orderUrl = `${APP_URL()}/seller/orders/${order._id}`;

    const productRowsHtml = (order.products || [])
      .map((line) => {
        const product =
          line.productId && typeof line.productId === "object"
            ? line.productId
            : null;
        const name = product?.name || "Sản phẩm";
        const imageUrl = productImage(product);
        const lineTotal = (line.price || 0) * (line.quantity || 1);

        /* Bố cục bằng table lồng nhau — flexbox bị Gmail/Outlook loại bỏ. */
        return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid ${T.rule};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="56" valign="top" style="width:56px;">
                  ${
                    imageUrl
                      ? `<img src="${esc(imageUrl)}" alt="${esc(name)}" width="56" height="56" style="display:block;width:56px;height:56px;border:1px solid ${T.rule};border-radius:2px;" />`
                      : `<div style="width:56px;height:56px;background-color:${T.ivory};border:1px solid ${T.rule};border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>`
                  }
                </td>
                <td valign="top" style="padding-left:14px;">
                  <div style="font-family:${FONT_SANS};font-size:14px;font-weight:600;line-height:1.4;color:${T.ink};">${esc(name)}</div>
                  <div style="margin-top:4px;${numeric()}font-size:12px;color:${T.muted};">Đơn giá ${vnd(line.price)}</div>
                </td>
              </tr>
            </table>
          </td>
          <td align="center" valign="middle" style="padding:14px 0 14px 12px;border-bottom:1px solid ${T.rule};font-family:${FONT_SANS};font-size:13px;color:${T.text};white-space:nowrap;">×${line.quantity || 1}</td>
          <td align="right" valign="middle" style="padding:14px 0 14px 12px;border-bottom:1px solid ${T.rule};${numeric()}font-size:13px;font-weight:600;color:${T.ink};white-space:nowrap;">${vnd(lineTotal)}</td>
        </tr>`;
      })
      .join("");

    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Bạn có đơn hàng mới - Eco Market",
      htmlContent: layout({
        preview: `Đơn #${String(order._id).slice(-8).toUpperCase()} — vui lòng xác nhận trong 24 giờ.`,
        eyebrow: "Đơn hàng mới",
        title: "Có khách<br />vừa đặt mua",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(sellerName || "bạn")}</strong>, một khách hàng vừa đặt mua sản phẩm của bạn. Vui lòng xác nhận đơn để bắt đầu quá trình giao hàng.`)}

          ${sectionLabel("Sản phẩm đặt mua")}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${T.rule};">
            ${
              productRowsHtml ||
              `<tr><td style="padding:16px 0;border-bottom:1px solid ${T.rule};font-family:${FONT_SANS};font-size:13px;color:${T.muted};">—</td></tr>`
            }
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px;">
            <tr>
              <td style="padding:12px 0;font-family:${FONT_SANS};font-size:13px;color:${T.muted};">Tiền hàng</td>
              <td align="right" style="padding:12px 0;${numeric()}font-size:13px;font-weight:600;color:${T.ink};">${vnd(order.productAmount)}</td>
            </tr>
            <tr>
              <td style="padding:0 0 12px;font-family:${FONT_SANS};font-size:13px;color:${T.muted};">Phí vận chuyển</td>
              <td align="right" style="padding:0 0 12px;${numeric()}font-size:13px;font-weight:600;color:${T.ink};">${vnd(order.shippingFee)}</td>
            </tr>
            <tr>
              <td style="padding:14px 0 0;border-top:1px solid ${T.ink};font-family:${FONT_SANS};font-size:13px;font-weight:600;color:${T.ink};">Tổng đơn hàng</td>
              <td align="right" style="padding:14px 0 0;border-top:1px solid ${T.ink};${numeric()}font-size:21px;font-weight:600;letter-spacing:-0.3px;color:${T.ink};">${vnd(order.totalAmount)}</td>
            </tr>
          </table>

          ${sectionLabel("Thông tin đơn hàng")}
          ${dataRows([
            {
              label: "Mã đơn hàng",
              value: `#${String(order._id).slice(-10).toUpperCase()}`
            },
            {
              label: "Thanh toán",
              value:
                order.paymentMethod === "cod"
                  ? "COD — thu tiền khi giao"
                  : "Chuyển khoản ngân hàng"
            },
            { label: "Vận chuyển", value: order.shippingMethod || "GHN" }
          ])}

          ${
            buyer
              ? `${sectionLabel("Người mua")}
          ${dataRows([
            { label: "Họ tên", value: buyer.fullName || "—" },
            buyer.phoneNumber
              ? { label: "Số điện thoại", value: buyer.phoneNumber }
              : null,
            buyer.email ? { label: "Email", value: buyer.email } : null
          ])}`
              : ""
          }

          ${callout({
            label: "Cần hành động",
            html: "Vui lòng xác nhận đơn hàng trong vòng <strong>24 giờ</strong>. Quá thời hạn, đơn có thể bị hủy tự động."
          })}

          <div style="margin:30px 0 0;">
            ${button(orderUrl, "Xem & xác nhận đơn")}
          </div>
        `
      })
    });
    console.log("Email new order to seller đã gửi tới:", toEmail);
  } catch (error) {
    console.error("Lỗi gửi email new order:", error.response?.body || error);
    throw error;
  }
};

const sendOrderShippedEmail = async (toEmail, userName, order) => {
  try {
    const orderUrl = `${APP_URL()}/orders/${order._id}`;
    const shortId = String(order._id).slice(-8).toUpperCase();
    const expected = order.expectedDeliveryTime
      ? new Date(order.expectedDeliveryTime).toLocaleDateString("vi-VN", {
          weekday: "long",
          day: "2-digit",
          month: "2-digit"
        })
      : null;

    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Đơn hàng đang được giao - Eco Market",
      htmlContent: layout({
        preview: `Đơn #${shortId} đã rời kho và đang trên đường đến bạn.`,
        eyebrow: "Vận chuyển",
        title: "Đang trên<br />đường đến bạn",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(userName || "bạn")}</strong>, đơn hàng của bạn đã được bàn giao cho đơn vị vận chuyển.`)}

          ${dataRows([
            { label: "Mã đơn hàng", value: `#${shortId}` },
            { label: "Đơn vị vận chuyển", value: order.shippingMethod || "GHN" },
            expected
              ? { label: "Dự kiến giao", value: expected, emphasis: true }
              : null
          ])}

          ${callout({
            label: "Khi nhận hàng",
            html: "Vui lòng kiểm tra kỹ tình trạng sản phẩm trước khi xác nhận. Nếu có sai lệch so với mô tả, bạn có thể mở yêu cầu hoàn tiền ngay trên trang đơn hàng."
          })}

          <div style="margin:30px 0 0;">
            ${button(orderUrl, "Theo dõi đơn hàng")}
          </div>
        `
      })
    });
  } catch (error) {
    console.error(
      "Lỗi gửi email order shipped:",
      error.response?.body || error
    );
  }
};

const sendRefundApprovedEmail = async (toEmail, userName, order) => {
  try {
    const orderUrl = `${APP_URL()}/orders/${order._id}`;
    const shortId = String(order._id).slice(-8).toUpperCase();

    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Yêu cầu hoàn tiền được chấp thuận - Eco Market",
      htmlContent: layout({
        preview: `Đơn #${shortId} được hoàn ${vnd(order.totalAmount)}.`,
        eyebrow: "Hoàn tiền",
        title: "Yêu cầu được<br />chấp thuận",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(userName || "bạn")}</strong>, yêu cầu hoàn tiền của bạn đã được chấp thuận.`)}

          ${dataRows([
            { label: "Mã đơn hàng", value: `#${shortId}` },
            {
              label: "Số tiền hoàn lại",
              value: vnd(order.totalAmount),
              emphasis: true
            }
          ])}

          ${callout({
            label: "Thời gian nhận tiền",
            tone: "accent",
            html: "Khoản tiền sẽ được chuyển về phương thức thanh toán ban đầu của bạn. Tùy ngân hàng, quá trình này có thể mất từ <strong>3 đến 7 ngày làm việc</strong>."
          })}

          <div style="margin:30px 0 0;">
            ${button(orderUrl, "Xem chi tiết đơn hàng")}
          </div>
        `
      })
    });
  } catch (error) {
    console.error(
      "Lỗi gửi email refund approved:",
      error.response?.body || error
    );
  }
};

const sendPayoutReleasedEmail = async (
  toEmail,
  sellerName,
  order,
  netAmount
) => {
  try {
    const walletUrl = `${APP_URL()}/seller/wallet`;
    const shortId = String(order._id).slice(-8).toUpperCase();

    await apiInstance.sendTransacEmail({
      sender: SENDER(),
      to: [{ email: toEmail }],
      subject: "Doanh thu đã được giải ngân - Eco Market",
      htmlContent: layout({
        preview: `${vnd(netAmount)} từ đơn #${shortId} đã vào ví của bạn.`,
        eyebrow: "Doanh thu",
        title: "Đã giải ngân<br />vào ví",
        body: `
          ${paragraph(`Xin chào <strong style="color:${T.ink};font-weight:600;">${esc(sellerName || "bạn")}</strong>, đơn hàng đã hoàn tất và doanh thu tương ứng vừa được cộng vào ví của bạn.`)}

          ${dataRows([
            { label: "Mã đơn hàng", value: `#${shortId}` },
            {
              label: "Số tiền nhận được",
              value: vnd(netAmount),
              emphasis: true
            }
          ])}

          ${callout({
            tone: "accent",
            html: "Bạn có thể yêu cầu rút tiền về tài khoản ngân hàng bất cứ lúc nào tại trang ví."
          })}

          <div style="margin:30px 0 0;">
            ${button(walletUrl, "Xem ví của tôi")}
          </div>
        `
      })
    });
  } catch (error) {
    console.error(
      "Lỗi gửi email payout released:",
      error.response?.body || error
    );
  }
};

module.exports = {
  generateVerificationCode,
  sendVerificationEmail,
  sendOtpEmail,
  sendResetPasswordEmail,
  sendPasswordChangedEmail,
  sendAccountChangeEmail,
  sendAccountBannedEmail,
  sendAccountUnbannedEmail,
  sendAppealReceivedToUserEmail,
  sendProductListedEmail,
  sendProductApprovedEmail,
  sendProductRejectedEmail,
  sendProductUnderReviewEmail,
  sendOrderPlacedEmail,
  sendPaymentSuccessEmail,
  sendNewOrderToSellerEmail,
  sendOrderShippedEmail,
  sendRefundApprovedEmail,
  sendPayoutReleasedEmail
};
