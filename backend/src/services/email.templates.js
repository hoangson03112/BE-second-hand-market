"use strict";

/**
 * Email templates cho Eco Market.
 * Tất cả HTML content được tách riêng để dễ chỉnh sửa và bảo trì.
 */

// ─── Layout parts ────────────────────────────────────────────────────────────

function getEmailHeader() {
  return `
  <tr>
    <td style="background: linear-gradient(135deg, #8b7355 0%, #6b5a42 100%); padding: 48px 40px; text-align: center;">
      <div style="background: rgba(255, 255, 255, 0.15); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 20px; padding: 16px; display: inline-block; margin-bottom: 20px;">
        <span style="font-size: 40px;">🌱</span>
      </div>
      <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; text-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        Eco Market
      </h1>
      <p style="margin: 12px 0 0 0; color: #f5f1e8; font-size: 15px; font-weight: 500; letter-spacing: 0.3px;">
        Chợ đồ cũ thân thiện môi trường
      </p>
    </td>
  </tr>
`;
}

function getEmailFooter() {
  return `
  <tr>
    <td style="padding: 32px 40px; background: linear-gradient(to bottom, #faf8f3 0%, #f5f1e8 100%); text-align: center; border-top: 1px solid #ede5d8;">
      <p style="margin: 0 0 16px 0; color: #8b7355; font-size: 14px; line-height: 1.6;">
        <strong>Cần hỗ trợ?</strong><br />
        <a href="mailto:support@ecomarket.vn" style="color: #8b7355; text-decoration: underline;">support@ecomarket.vn</a>
      </p>
      <div style="margin: 20px 0; padding: 16px 0; border-top: 1px solid #ede5d8; border-bottom: 1px solid #ede5d8;">
        <a href="#" style="display: inline-block; margin: 0 10px; width: 36px; height: 36px; line-height: 36px; border-radius: 50%; background: rgba(139, 115, 85, 0.1); color: #8b7355; text-decoration: none; font-size: 16px;">📘</a>
        <a href="#" style="display: inline-block; margin: 0 10px; width: 36px; height: 36px; line-height: 36px; border-radius: 50%; background: rgba(139, 115, 85, 0.1); color: #8b7355; text-decoration: none; font-size: 16px;">📷</a>
        <a href="#" style="display: inline-block; margin: 0 10px; width: 36px; height: 36px; line-height: 36px; border-radius: 50%; background: rgba(139, 115, 85, 0.1); color: #8b7355; text-decoration: none; font-size: 16px;">🐦</a>
      </div>
      <p style="margin: 0; color: #b0a090; font-size: 12px; line-height: 1.6;">
        © 2026 Eco Market. Bảo lưu mọi quyền.<br />
        Email này được gửi tự động, vui lòng không trả lời.
      </p>
    </td>
  </tr>
  <tr>
    <td align="center">
      <p style="margin: 24px 0 0 0; color: #9a8875; font-size: 13px; text-align: center; font-style: italic;">
        🌍 Mua bán thông minh, sống xanh bền vững
      </p>
    </td>
  </tr>
`;
}

const bodyStyles =
  "margin: 0; padding: 0; background: linear-gradient(135deg, #faf8f3 0%, #f5f1e8 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;";
const cardStyles =
  "max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 24px; box-shadow: 0 10px 40px rgba(92, 84, 68, 0.08); overflow: hidden;";

function wrapWithLayout(bodyContent) {
  return `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="${bodyStyles}">
  <table role="presentation" style="width: 100%; border-collapse: collapse; padding: 40px 20px;">
    <tr><td align="center">
      <table role="presentation" style="${cardStyles}">
        ${getEmailHeader()}
        ${bodyContent}
        ${getEmailFooter()}
      </table>
    </td></tr>
  </table>
</body>
</html>
`;
}

// ─── 1. Verification ─────────────────────────────────────────────────────────

function verification({ code }) {
  return wrapWithLayout(`
    <tr><td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #2d2416; font-size: 26px; font-weight: 700; text-align: center;">🔑 Xác thực tài khoản</h2>
      <p style="margin: 0 0 24px 0; color: #5c5444; font-size: 16px; line-height: 1.6; text-align: center;">
        Mã xác thực của bạn là:
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <span style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #8b7355 0%, #6b5a42 100%); color: #ffffff; border-radius: 12px; font-weight: 600; font-size: 28px; letter-spacing: 4px;">
          ${code}
        </span>
      </div>
      <p style="margin: 24px 0 0 0; color: #9a8875; font-size: 13px; text-align: center; line-height: 1.6;">
        Mã này sẽ hết hạn sau 10 phút. Nếu bạn không yêu cầu, vui lòng bỏ qua email này.
      </p>
    </td></tr>
  `);
}

// ─── 2. Reset password ───────────────────────────────────────────────────────

function resetPassword({ resetLink, userName, expiryMinutes }) {
  return wrapWithLayout(`
    <tr><td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #2d2416; font-size: 26px; font-weight: 700; text-align: center;">🔐 Đặt lại mật khẩu</h2>
      <p style="margin: 0 0 24px 0; color: #5c5444; font-size: 16px; line-height: 1.6; text-align: center;">
        Xin chào <strong>${userName || "bạn"}</strong>,<br />
        Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetLink}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #8b7355 0%, #6b5a42 100%); color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(139, 115, 85, 0.3);">
          Đặt lại mật khẩu
        </a>
      </div>
      <div style="background: #fff8f0; border-left: 4px solid #d4a574; border-radius: 12px; padding: 20px 24px; margin: 24px 0;">
        <p style="margin: 0; color: #8b6f47; font-size: 14px; line-height: 1.7;">
          <strong>⏱️ Lưu ý:</strong> Link này sẽ hết hạn sau <strong>${expiryMinutes} phút</strong>.<br />
          Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.
        </p>
      </div>
      <p style="margin: 24px 0 0 0; color: #9a8875; font-size: 13px; text-align: center; line-height: 1.6;">
        Hoặc copy link sau vào trình duyệt:<br />
        <span style="word-break: break-all; color: #8b7355;">${resetLink}</span>
      </p>
    </td></tr>
  `);
}

// ─── 3. Password changed ─────────────────────────────────────────────────────

function passwordChanged({ userName }) {
  return wrapWithLayout(`
    <tr><td style="padding: 48px 40px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 80px; height: 80px; margin: 0 auto; background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 40px;">✅</span>
        </div>
      </div>
      <h2 style="margin: 0 0 16px 0; color: #2d2416; font-size: 26px; font-weight: 700; text-align: center;">Mật khẩu đã được thay đổi</h2>
      <p style="margin: 0 0 24px 0; color: #5c5444; font-size: 16px; line-height: 1.6; text-align: center;">
        Xin chào <strong>${userName || "bạn"}</strong>,<br />
        Mật khẩu tài khoản Eco Market của bạn đã được thay đổi thành công.
      </p>
      <div style="background: #ecfdf5; border-left: 4px solid #10b981; border-radius: 12px; padding: 20px 24px; margin: 24px 0;">
        <p style="margin: 0; color: #065f46; font-size: 14px; line-height: 1.7;">
          <strong>🔒 Bảo mật tài khoản:</strong><br />
          • Thời gian: ${new Date().toLocaleString("vi-VN")}<br />
          • Nếu bạn không thực hiện thay đổi này, vui lòng liên hệ ngay với chúng tôi.
        </p>
      </div>
    </td></tr>
  `);
}

// ─── 4. Account change ───────────────────────────────────────────────────────

function accountChange({ userName, typeText, newValue }) {
  return wrapWithLayout(`
    <tr><td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #2d2416; font-size: 26px; font-weight: 700; text-align: center;">📝 Thông tin đã được cập nhật</h2>
      <p style="margin: 0 0 24px 0; color: #5c5444; font-size: 16px; line-height: 1.6; text-align: center;">
        Xin chào <strong>${userName || "bạn"}</strong>,<br />
        ${typeText} tài khoản của bạn đã được thay đổi thành công.
      </p>
      <div style="background: linear-gradient(135deg, #faf8f3 0%, #f5f1e8 100%); border: 2px solid #d4c4ab; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
        <p style="margin: 0 0 8px 0; color: #8b7355; font-size: 13px; font-weight: 600; text-transform: uppercase;">
          ${typeText} mới
        </p>
        <p style="margin: 0; color: #2d2416; font-size: 18px; font-weight: 700;">
          ${newValue}
        </p>
      </div>
      <div style="background: #fff8f0; border-left: 4px solid #d4a574; border-radius: 12px; padding: 20px 24px;">
        <p style="margin: 0; color: #8b6f47; font-size: 14px; line-height: 1.7;">
          <strong>🔒 Bảo mật:</strong> Nếu bạn không thực hiện thay đổi này, vui lòng liên hệ ngay với chúng tôi.
        </p>
      </div>
    </td></tr>
  `);
}

// ─── 5. Product listed ───────────────────────────────────────────────────────

function productListed({ userName, productUrl, productImageHtml, productName, productPrice, productDescription }) {
  return wrapWithLayout(`
    <tr><td style="padding: 48px 40px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 60px;">🎉</span>
      </div>
      <h2 style="margin: 0 0 16px 0; color: #2d2416; font-size: 26px; font-weight: 700; text-align: center;">Sản phẩm đã được đăng!</h2>
      <p style="margin: 0 0 32px 0; color: #5c5444; font-size: 16px; line-height: 1.6; text-align: center;">
        Xin chào <strong>${userName || "bạn"}</strong>,<br />
        Sản phẩm của bạn đã được đăng thành công trên Eco Market.
      </p>
      ${productImageHtml}
      <div style="background: linear-gradient(135deg, #faf8f3 0%, #f5f1e8 100%); border-radius: 12px; padding: 24px; margin: 24px 0;">
        <h3 style="margin: 0 0 12px 0; color: #8b7355; font-size: 18px;">${productName}</h3>
        <p style="margin: 0 0 8px 0; color: #2d2416; font-size: 24px; font-weight: 700;">${productPrice}</p>
        ${productDescription}
      </div>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${productUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #8b7355 0%, #6b5a42 100%); color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px;">
          Xem sản phẩm
        </a>
      </div>
      <div style="background: #ecfdf5; border-left: 4px solid #10b981; border-radius: 12px; padding: 20px 24px;">
        <p style="margin: 0; color: #065f46; font-size: 14px; line-height: 1.7;">
          <strong>💡 Mẹo bán hàng:</strong><br />
          • Cập nhật ảnh chất lượng cao<br />
          • Mô tả chi tiết sản phẩm<br>
          • Phản hồi nhanh các câu hỏi
        </p>
      </div>
    </td></tr>
  `);
}

// ─── 6. Product approved ─────────────────────────────────────────────────────

function productApproved({ userName, productName, productUrl }) {
  return wrapWithLayout(`
    <tr><td style="padding: 48px 40px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 80px; height: 80px; margin: 0 auto; background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 40px;">✅</span>
        </div>
      </div>
      <h2 style="margin: 0 0 16px 0; color: #2d2416; font-size: 26px; font-weight: 700; text-align: center;">Sản phẩm đã được duyệt!</h2>
      <p style="margin: 0 0 32px 0; color: #5c5444; font-size: 16px; line-height: 1.6; text-align: center;">
        Xin chào <strong>${userName || "bạn"}</strong>,<br>
        Sản phẩm "<strong>${productName}</strong>" đã được kiểm duyệt và hiển thị trên Eco Market.
      </p>
      <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border: 2px solid #10b981; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
        <p style="margin: 0 0 8px 0; color: #065f46; font-size: 14px; font-weight: 600;">🎊 Chúc mừng!</p>
        <p style="margin: 0; color: #047857; font-size: 16px; line-height: 1.6;">
          Sản phẩm của bạn đã sẵn sàng để bán.<br>
          Hãy chuẩn bị để nhận đơn hàng nhé!
        </p>
      </div>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${productUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #8b7355 0%, #6b5a42 100%); color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px;">
          Xem sản phẩm
        </a>
      </div>
    </td></tr>
  `);
}

// ─── 7. Product rejected ─────────────────────────────────────────────────────

function productRejected({ userName, productName, sellUrl, reasonHtml }) {
  return wrapWithLayout(`
    <tr><td style="padding: 40px 40px 32px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="width: 72px; height: 72px; margin: 0 auto; background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 36px;">❌</span>
        </div>
      </div>
      <h2 style="margin: 0 0 12px 0; color: #2d2416; font-size: 24px; font-weight: 700; text-align: center;">Sản phẩm chưa được duyệt</h2>
      <p style="margin: 0 0 28px 0; color: #5c5444; font-size: 15px; line-height: 1.6; text-align: center;">
        Xin chào <strong>${userName || "bạn"}</strong>,<br>
        Sản phẩm của bạn chưa đáp ứng tiêu chuẩn nên chưa được hiển thị.
      </p>
      <div style="background: #faf8f3; border: 1.5px solid #e8ddd0; border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 24px;">📦</span>
        <div>
          <p style="margin: 0 0 2px; font-size: 11px; color: #8b7355; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Sản phẩm</p>
          <p style="margin: 0; color: #2d2416; font-size: 15px; font-weight: 700;">${productName}</p>
        </div>
      </div>
      ${reasonHtml}
      <div style="background: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 0 12px 12px 0; padding: 16px 20px; margin-bottom: 28px;">
        <p style="margin: 0 0 8px; color: #15803d; font-size: 13px; font-weight: 700;">💡 Bạn có thể làm gì?</p>
        <ul style="margin: 0; padding-left: 18px; color: #166534; font-size: 13px; line-height: 1.8;">
          <li>Đọc kỹ lý do từ chối bên trên</li>
          <li>Chỉnh sửa tiêu đề, mô tả hoặc hình ảnh</li>
          <li>Đảm bảo sản phẩm không vi phạm chính sách</li>
          <li>Đăng lại sản phẩm sau khi đã cập nhật</li>
        </ul>
      </div>
      <div style="text-align: center; margin-bottom: 8px;">
        <a href="${sellUrl}" style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #8b7355 0%, #6b5a42 100%); color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(139,115,85,0.3);">
          Đăng lại sản phẩm
        </a>
      </div>
    </td></tr>
  `);
}

// ─── 8. Order placed (xác nhận đặt hàng — gửi ngay khi buyer đặt) ────────────

function orderPlaced({ userName, orderId, totalAmount, paymentMethod, orderUrl, isCOD }) {
  const nextSteps = isCOD
    ? "Với COD, bạn sẽ thanh toán khi nhận hàng. Người bán sẽ chuẩn bị và gửi đơn cho bạn."
    : "Vui lòng chuyển khoản theo thông tin trong đơn hàng và tải ảnh xác nhận. Người bán sẽ xác nhận sau khi nhận được thanh toán.";
  return wrapWithLayout(`
    <tr><td style="padding: 40px 32px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 72px; height: 72px; margin: 0 auto; background: #1a1714; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
          <span style="font-size: 32px;">📦</span>
        </div>
      </div>
      <h2 style="margin: 0 0 8px 0; color: #1a1714; font-size: 24px; font-weight: 700; text-align: center;">Đặt hàng thành công!</h2>
      <p style="margin: 0 0 24px 0; color: #5c5444; font-size: 15px; line-height: 1.6; text-align: center;">
        Xin chào <strong>${userName || "bạn"}</strong>,<br>
        Đơn hàng của bạn đã được tiếp nhận. Chờ người bán xác nhận.
      </p>
      <div style="background: #faf8f3; border-radius: 12px; padding: 20px 24px; margin: 24px 0; border: 1px solid #ede5d8;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 6px 0; color: #8b7355; font-size: 13px;">Mã đơn hàng</td><td style="padding: 6px 0; color: #1a1714; font-size: 13px; font-weight: 700; text-align: right;">#${orderId}</td></tr>
          <tr><td style="padding: 6px 0; color: #8b7355; font-size: 13px;">Tổng tiền</td><td style="padding: 6px 0; color: #1a1714; font-size: 18px; font-weight: 700; text-align: right;">${totalAmount} ₫</td></tr>
          <tr><td style="padding: 6px 0; color: #8b7355; font-size: 13px;">Thanh toán</td><td style="padding: 6px 0; color: #1a1714; font-size: 13px; font-weight: 600; text-align: right;">${paymentMethod}</td></tr>
        </table>
      </div>
      <div style="background: #f0fdf4; border-radius: 12px; padding: 16px 20px; margin: 20px 0; border-left: 4px solid #22c55e;">
        <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.6;">${nextSteps}</p>
      </div>
      <div style="text-align: center; margin: 28px 0 0;">
        <a href="${orderUrl}" style="display: inline-block; padding: 14px 32px; background: #1a1714; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px;">
          Theo dõi đơn hàng
        </a>
      </div>
    </td></tr>
  `);
}

// ─── 9. Payment success (chỉ khi đã thanh toán thực sự: CK xác nhận / COD đã thu) ─

function paymentSuccess({ userName, orderId, totalAmount, paymentMethod, orderUrl }) {
  return wrapWithLayout(`
    <tr><td style="padding: 40px 32px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 72px; height: 72px; margin: 0 auto; background: #059669; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
          <span style="font-size: 32px;">✓</span>
        </div>
      </div>
      <h2 style="margin: 0 0 8px 0; color: #1a1714; font-size: 24px; font-weight: 700; text-align: center;">Thanh toán đã xác nhận</h2>
      <p style="margin: 0 0 24px 0; color: #5c5444; font-size: 15px; line-height: 1.6; text-align: center;">
        Xin chào <strong>${userName || "bạn"}</strong>,<br>
        Thanh toán cho đơn hàng của bạn đã được xác nhận thành công.
      </p>
      <div style="background: #f0fdf4; border-radius: 12px; padding: 20px 24px; margin: 24px 0; border: 1px solid #bbf7d0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 6px 0; color: #166534; font-size: 13px;">Mã đơn hàng</td><td style="padding: 6px 0; color: #1a1714; font-size: 13px; font-weight: 700; text-align: right;">#${orderId}</td></tr>
          <tr><td style="padding: 6px 0; color: #166534; font-size: 13px;">Số tiền đã thanh toán</td><td style="padding: 6px 0; color: #1a1714; font-size: 18px; font-weight: 700; text-align: right;">${totalAmount} ₫</td></tr>
          <tr><td style="padding: 6px 0; color: #166534; font-size: 13px;">Phương thức</td><td style="padding: 6px 0; color: #1a1714; font-size: 13px; font-weight: 600; text-align: right;">${paymentMethod}</td></tr>
        </table>
      </div>
      <div style="text-align: center; margin: 28px 0 0;">
        <a href="${orderUrl}" style="display: inline-block; padding: 14px 32px; background: #1a1714; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px;">
          Xem đơn hàng
        </a>
      </div>
    </td></tr>
  `);
}

// ─── 9. New order to seller ───────────────────────────────────────────────────

function newOrderToSeller({ sellerName, productRowsHtml, order, buyerHtml }) {
  return `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #f5f1e8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; padding: 32px 16px;">
    <tr><td align="center">
      <table role="presentation" style="max-width: 600px; width: 100%; background: #ffffff; border-radius: 20px; box-shadow: 0 8px 32px rgba(92,84,68,0.10); overflow: hidden;">
        ${getEmailHeader()}
        <tr>
          <td style="background: linear-gradient(135deg, #fffbf0 0%, #fff8ec 100%); border-bottom: 1px solid #f0e8d8; padding: 16px 32px; text-align: center;">
            <p style="margin: 0; font-size: 22px;">🎉</p>
            <h2 style="margin: 6px 0 4px; color: #2d2416; font-size: 20px; font-weight: 700;">Bạn có đơn hàng mới!</h2>
            <p style="margin: 0; color: #8b7355; font-size: 14px;">Xin chào <strong>${sellerName || "Seller"}</strong>, có khách vừa đặt mua sản phẩm của bạn.</p>
          </td>
        </tr>
        <tr><td style="padding: 28px 32px 0;">
          <h3 style="margin: 0 0 14px 0; color: #6b5a42; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">📦 Sản phẩm đặt mua</h3>
          <div style="border: 1.5px solid #e8ddd0; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse; padding: 0 16px;">
              <thead>
                <tr style="background: #faf8f3;">
                  <th style="padding: 10px 16px; text-align: left; font-size: 11px; color: #8b7355; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Sản phẩm</th>
                  <th style="padding: 10px 8px; text-align: center; font-size: 11px; color: #8b7355; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;">Số lượng</th>
                  <th style="padding: 10px 16px; text-align: right; font-size: 11px; color: #8b7355; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;">Thành tiền</th>
                </tr>
              </thead>
              <tbody style="padding: 0 16px;">
                ${productRowsHtml}
              </tbody>
            </table>
            <div style="background: #faf8f3; border-top: 1.5px solid #e8ddd0; padding: 14px 16px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="font-size: 13px; color: #8b7355;">Tiền hàng</td>
                  <td style="font-size: 13px; color: #2d2416; font-weight: 600; text-align: right;">${order.productAmountFormatted} ₫</td>
                </tr>
                <tr>
                  <td style="font-size: 13px; color: #8b7355; padding-top: 6px;">Phí vận chuyển</td>
                  <td style="font-size: 13px; color: #2d2416; font-weight: 600; text-align: right; padding-top: 6px;">${order.shippingFeeFormatted} ₫</td>
                </tr>
                <tr>
                  <td style="font-size: 15px; color: #2d2416; font-weight: 700; padding-top: 10px; border-top: 1px dashed #d4c4ab;">Tổng đơn hàng</td>
                  <td style="font-size: 18px; color: #8b7355; font-weight: 800; text-align: right; padding-top: 10px; border-top: 1px dashed #d4c4ab;">${order.totalAmountFormatted} ₫</td>
                </tr>
              </table>
            </div>
          </div>
          <h3 style="margin: 0 0 14px 0; color: #6b5a42; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">🗒️ Thông tin đơn hàng</h3>
          <div style="border: 1.5px solid #e8ddd0; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #f0e8d8;">
                <td style="padding: 11px 16px; font-size: 13px; color: #8b7355; width: 40%;">Mã đơn hàng</td>
                <td style="padding: 11px 16px; font-size: 13px; color: #2d2416; font-weight: 700; font-family: monospace;">#${order.shortId}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f0e8d8; background: #fdfcfa;">
                <td style="padding: 11px 16px; font-size: 13px; color: #8b7355;">Thanh toán</td>
                <td style="padding: 11px 16px; font-size: 13px; color: #2d2416; font-weight: 600;">${order.paymentMethodText}</td>
              </tr>
              <tr>
                <td style="padding: 11px 16px; font-size: 13px; color: #8b7355;">Vận chuyển</td>
                <td style="padding: 11px 16px; font-size: 13px; color: #2d2416; font-weight: 600;">${order.shippingMethod || "GHN"}</td>
              </tr>
            </table>
          </div>
          ${buyerHtml}
          <div style="text-align: center; padding: 8px 0 28px;">
            <a href="${order.orderUrl}" style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #8b7355 0%, #6b5a42 100%); color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(139,115,85,0.3); letter-spacing: 0.2px;">
              Xem &amp; Xác nhận đơn hàng →
            </a>
            <p style="margin: 12px 0 0; color: #9a8875; font-size: 12px;">Vui lòng xác nhận trong vòng <strong>24 giờ</strong></p>
          </div>
        </td></tr>
        ${getEmailFooter()}
      </table>
    </td></tr>
  </table>
</body>
</html>
`;
}

// ─── 10. Product under review ─────────────────────────────────────────────────

function productUnderReview({ userName, productName, listingsUrl }) {
  return wrapWithLayout(`
    <tr><td style="padding: 48px 40px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 80px; height: 80px; margin: 0 auto; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 40px;">🔍</span>
        </div>
      </div>
      <h2 style="margin: 0 0 16px 0; color: #2d2416; font-size: 24px; font-weight: 700; text-align: center;">Sản phẩm đang được xem xét</h2>
      <p style="margin: 0 0 28px 0; color: #5c5444; font-size: 15px; line-height: 1.6; text-align: center;">
        Xin chào <strong>${userName || "bạn"}</strong>,<br>
        Sản phẩm "<strong>${productName}</strong>" đang được đội ngũ kiểm duyệt xem xét thủ công.
      </p>
      <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 2px solid #3b82f6; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
        <p style="margin: 0 0 8px 0; color: #1e3a8a; font-size: 14px; font-weight: 600;">⏱ Thời gian xử lý</p>
        <p style="margin: 0; color: #1d4ed8; font-size: 15px; line-height: 1.6;">
          Thông thường trong vòng <strong>24 giờ</strong>.<br>
          Bạn sẽ nhận được thông báo ngay khi có kết quả.
        </p>
      </div>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${listingsUrl}" style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #8b7355 0%, #6b5a42 100%); color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px;">
          Xem danh sách sản phẩm
        </a>
      </div>
    </td></tr>
  `);
}

// ─── 11. Order shipped (simple layout) ────────────────────────────────────────

function orderShipped({ userName, shortId, orderUrl, expectedHtml }) {
  return `
<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9f5f0;padding:24px;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #ede5d8">
    <div style="background:#1a1714;padding:24px 28px">
      <h1 style="color:#fff;margin:0;font-size:22px">🚚 Đơn hàng đang trên đường đến bạn!</h1>
    </div>
    <div style="padding:28px">
      <p style="color:#3d3530;margin:0 0 12px">Xin chào <strong>${userName || "bạn"}</strong>,</p>
      <p style="color:#5c4f46;margin:0 0 20px">Đơn hàng <strong>#${shortId}</strong> đã được giao cho đơn vị vận chuyển và đang trên đường đến bạn.</p>
      ${expectedHtml}
      <a href="${orderUrl}" style="display:inline-block;background:#1a1714;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Theo dõi đơn hàng</a>
    </div>
  </div>
</body></html>
`;
}

// ─── 12. Refund approved (simple layout) ──────────────────────────────────────

function refundApproved({ userName, shortId, totalAmountFormatted, orderUrl }) {
  return `
<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9f5f0;padding:24px;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #ede5d8">
    <div style="background:#1a1714;padding:24px 28px">
      <h1 style="color:#fff;margin:0;font-size:22px">✅ Hoàn tiền được chấp thuận</h1>
    </div>
    <div style="padding:28px">
      <p style="color:#3d3530;margin:0 0 12px">Xin chào <strong>${userName || "bạn"}</strong>,</p>
      <p style="color:#5c4f46;margin:0 0 12px">Yêu cầu hoàn tiền cho đơn hàng <strong>#${shortId}</strong> đã được chấp thuận.</p>
      <p style="color:#5c4f46;margin:0 0 20px">Số tiền hoàn lại: <strong style="color:#c47b5a">${totalAmountFormatted}₫</strong></p>
      <a href="${orderUrl}" style="display:inline-block;background:#1a1714;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Xem chi tiết đơn hàng</a>
    </div>
  </div>
</body></html>
`;
}

// ─── 13. Payout released (simple layout) ──────────────────────────────────────

function payoutReleased({ sellerName, shortId, netAmountFormatted, walletUrl }) {
  return `
<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9f5f0;padding:24px;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #ede5d8">
    <div style="background:#1a1714;padding:24px 28px">
      <h1 style="color:#fff;margin:0;font-size:22px">💰 Đơn hàng đủ điều kiện thanh toán</h1>
    </div>
    <div style="padding:28px">
      <p style="color:#3d3530;margin:0 0 12px">Xin chào <strong>${sellerName || "bạn"}</strong>,</p>
      <p style="color:#5c4f46;margin:0 0 12px">Đơn hàng <strong>#${shortId}</strong> đã hoàn tất và không còn trong thời gian hoàn hàng.</p>
      <p style="color:#5c4f46;margin:0 0 12px">Số tiền dự kiến thanh toán: <strong style="color:#c47b5a">${netAmountFormatted}₫</strong></p>
      <p style="color:#5c4f46;margin:0 0 20px">Admin sẽ chuyển khoản theo thông tin ngân hàng đã đăng ký.</p>
      <a href="${walletUrl}" style="display:inline-block;background:#1a1714;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Xem chi tiết đơn hàng</a>
    </div>
  </div>
</body></html>
`;
}

// ─── Export ──────────────────────────────────────────────────────────────────

module.exports = {
  getEmailHeader,
  getEmailFooter,
  verification,
  resetPassword,
  passwordChanged,
  accountChange,
  productListed,
  productApproved,
  productRejected,
  orderPlaced,
  paymentSuccess,
  newOrderToSeller,
  productUnderReview,
  orderShipped,
  refundApproved,
  payoutReleased,
};
