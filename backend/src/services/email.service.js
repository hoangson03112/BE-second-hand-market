require("dotenv").config();
const SibApiV3Sdk = require("sib-api-v3-sdk");
const client = SibApiV3Sdk.ApiClient.instance;
client.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();


const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};


const sendVerificationEmail = async (toEmail, code) => {
  try {
    await apiInstance.sendTransacEmail({
      sender: { email: process.env.MAIL_FROM_EMAIL, name: "Eco Market" },
      to: [{ email: toEmail }],
      subject: "Mã xác thực tài khoản - Eco Market",
      htmlContent: `
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; background: linear-gradient(135deg, #faf8f3 0%, #f5f1e8 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; padding: 40px 20px;">
            <tr><td align="center">
              <table role="presentation" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 24px; box-shadow: 0 10px 40px rgba(92, 84, 68, 0.08); overflow: hidden;">
                ${getEmailHeader()}
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
                ${getEmailFooter()}
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });
    console.log("Email xác thực đã gửi tới:", toEmail);
  } catch (error) {
    console.error("Lỗi gửi email xác thực:", error.response?.body || error);
    throw error;
  }
};

/**
 * Gửi email với mã OTP (tương thích với tên hàm cũ)
 */
const sendOtpEmail = async (toEmail, otp) => {
  return sendVerificationEmail(toEmail, otp);
};

// ...existing code...

/**
 * Helper: Email header template
 */
const getEmailHeader = () => `
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

/**
 * Helper: Email footer template
 */
const getEmailFooter = () => `
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

/**
 * 2️⃣ Gửi email reset mật khẩu
 */
const sendResetPasswordEmail = async (toEmail, resetToken, userName) => {
  try {
    const resetLink = `${process.env.CLIENT_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`;
    const expiryMinutes = 15;

    await apiInstance.sendTransacEmail({
      sender: { email: "rtwf0311@gmail.com", name: "Eco Market" },
      to: [{ email: toEmail }],
      subject: "Yêu cầu đặt lại mật khẩu - Eco Market",
      htmlContent: `
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; background: linear-gradient(135deg, #faf8f3 0%, #f5f1e8 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; padding: 40px 20px;">
            <tr><td align="center">
              <table role="presentation" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 24px; box-shadow: 0 10px 40px rgba(92, 84, 68, 0.08); overflow: hidden;">
                ${getEmailHeader()}
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
                ${getEmailFooter()}
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });
    console.log("Email reset password đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email reset password:",
      error.response?.body || error,
    );
    throw error;
  }
};

/**
 * 4️⃣ Gửi email xác nhận đổi mật khẩu thành công
 */
const sendPasswordChangedEmail = async (toEmail, userName) => {
  try {
    await apiInstance.sendTransacEmail({
      sender: { email: "rtwf0311@gmail.com", name: "Eco Market" },
      to: [{ email: toEmail }],
      subject: "Mật khẩu đã được thay đổi - Eco Market",
      htmlContent: `
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; background: linear-gradient(135deg, #faf8f3 0%, #f5f1e8 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; padding: 40px 20px;">
            <tr><td align="center">
              <table role="presentation" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 24px; box-shadow: 0 10px 40px rgba(92, 84, 68, 0.08); overflow: hidden;">
                ${getEmailHeader()}
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
                ${getEmailFooter()}
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });
    console.log("Email password changed đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email password changed:",
      error.response?.body || error,
    );
    throw error;
  }
};

/**
 * 5️⃣ Gửi email xác nhận thay đổi email/số điện thoại
 */
const sendAccountChangeEmail = async (
  toEmail,
  userName,
  changeType,
  newValue,
) => {
  try {
    const typeText = changeType === "email" ? "Email" : "Số điện thoại";

    await apiInstance.sendTransacEmail({
      sender: { email: "rtwf0311@gmail.com", name: "Eco Market" },
      to: [{ email: toEmail }],
      subject: `Thay đổi ${typeText} - Eco Market`,
      htmlContent: `
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; background: linear-gradient(135deg, #faf8f3 0%, #f5f1e8 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; padding: 40px 20px;">
            <tr><td align="center">
              <table role="presentation" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 24px; box-shadow: 0 10px 40px rgba(92, 84, 68, 0.08); overflow: hidden;">
                ${getEmailHeader()}
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
                ${getEmailFooter()}
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });
    console.log(`Email ${typeText} change đã gửi tới:`, toEmail);
  } catch (error) {
    console.error(
      `Lỗi gửi email ${typeText} change:`,
      error.response?.body || error,
    );
    throw error;
  }
};

/**
 * 6️⃣ Gửi email xác nhận đăng bán sản phẩm thành công
 */
const sendProductListedEmail = async (toEmail, userName, product) => {
  try {
    const productUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/products/${product._id}`;

    await apiInstance.sendTransacEmail({
      sender: { email: "rtwf0311@gmail.com", name: "Eco Market" },
      to: [{ email: toEmail }],
      subject: "Sản phẩm đã được đăng - Eco Market",
      htmlContent: `
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; background: linear-gradient(135deg, #faf8f3 0%, #f5f1e8 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; padding: 40px 20px;">
            <tr><td align="center">
              <table role="presentation" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 24px; box-shadow: 0 10px 40px rgba(92, 84, 68, 0.08); overflow: hidden;">
                ${getEmailHeader()}
                <tr><td style="padding: 48px 40px;">
                  <div style="text-align: center; margin-bottom: 24px;">
                    <span style="font-size: 60px;">🎉</span>
                  </div>
                  <h2 style="margin: 0 0 16px 0; color: #2d2416; font-size: 26px; font-weight: 700; text-align: center;">Sản phẩm đã được đăng!</h2>
                  <p style="margin: 0 0 32px 0; color: #5c5444; font-size: 16px; line-height: 1.6; text-align: center;">
                    Xin chào <strong>${userName || "bạn"}</strong>,<br />
                    Sản phẩm của bạn đã được đăng thành công trên Eco Market.
                  </p>
                  
                  ${
                    product.images && product.images[0]
                      ? `
                  <div style="text-align: center; margin: 24px 0;">
                    <img src="${product.images[0]}" alt="${product.name}" style="max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                  </div>
                  `
                      : ""
                  }
                  
                  <div style="background: linear-gradient(135deg, #faf8f3 0%, #f5f1e8 100%); border-radius: 12px; padding: 24px; margin: 24px 0;">
                    <h3 style="margin: 0 0 12px 0; color: #8b7355; font-size: 18px;">${product.name}</h3>
                    <p style="margin: 0 0 8px 0; color: #2d2416; font-size: 24px; font-weight: 700;">${product.price?.toLocaleString("vi-VN")} ₫</p>
                    ${product.description ? `<p style="margin: 8px 0 0 0; color: #5c5444; font-size: 14px; line-height: 1.6;">${product.description.substring(0, 150)}${product.description.length > 150 ? "..." : ""}</p>` : ""}
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
                ${getEmailFooter()}
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });
    console.log("Email product listed đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email product listed:",
      error.response?.body || error,
    );
    throw error;
  }
};

/**
 * 7️⃣ Gửi email thông báo sản phẩm được duyệt
 */
const sendProductApprovedEmail = async (toEmail, userName, product) => {
  try {
    const productUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/products/${product._id}`;

    await apiInstance.sendTransacEmail({
      sender: { email: "rtwf0311@gmail.com", name: "Eco Market" },
      to: [{ email: toEmail }],
      subject: "✅ Sản phẩm đã được duyệt - Eco Market",
      htmlContent: `
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; background: linear-gradient(135deg, #faf8f3 0%, #f5f1e8 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; padding: 40px 20px;">
            <tr><td align="center">
              <table role="presentation" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 24px; box-shadow: 0 10px 40px rgba(92, 84, 68, 0.08); overflow: hidden;">
                ${getEmailHeader()}
                <tr><td style="padding: 48px 40px;">
                  <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 80px; height: 80px; margin: 0 auto; background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                      <span style="font-size: 40px;">✅</span>
                    </div>
                  </div>
                  <h2 style="margin: 0 0 16px 0; color: #2d2416; font-size: 26px; font-weight: 700; text-align: center;">Sản phẩm đã được duyệt!</h2>
                  <p style="margin: 0 0 32px 0; color: #5c5444; font-size: 16px; line-height: 1.6; text-align: center;">
                    Xin chào <strong>${userName || "bạn"}</strong>,<br>
                    Sản phẩm "<strong>${product.name}</strong>" đã được kiểm duyệt và hiển thị trên Eco Market.
                  </p>
                  
                  <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border: 2px solid #10b981; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
                    <p style="margin: 0 0 8px 0; color: #065f46; font-size: 14px; font-weight: 600;">
                      🎊 Chúc mừng!
                    </p>
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
                ${getEmailFooter()}
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });
    console.log("Email product approved đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email product approved:",
      error.response?.body || error,
    );
    throw error;
  }
};

/**
 * 8️⃣ Gửi email thông báo sản phẩm bị từ chối
 */
const sendProductRejectedEmail = async (toEmail, userName, product, reason) => {
  try {
    const sellUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/sell`;

    await apiInstance.sendTransacEmail({
      sender: { email: "rtwf0311@gmail.com", name: "Eco Market" },
      to: [{ email: toEmail }],
      subject: "❌ Sản phẩm chưa được duyệt - Eco Market",
      htmlContent: `
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; background: linear-gradient(135deg, #faf8f3 0%, #f5f1e8 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; padding: 40px 20px;">
            <tr><td align="center">
              <table role="presentation" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 24px; box-shadow: 0 10px 40px rgba(92, 84, 68, 0.08); overflow: hidden;">
                ${getEmailHeader()}
                <tr><td style="padding: 40px 40px 32px;">

                  <!-- Icon -->
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

                  <!-- Product name -->
                  <div style="background: #faf8f3; border: 1.5px solid #e8ddd0; border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 24px;">📦</span>
                    <div>
                      <p style="margin: 0 0 2px; font-size: 11px; color: #8b7355; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Sản phẩm</p>
                      <p style="margin: 0; color: #2d2416; font-size: 15px; font-weight: 700;">${product.name}</p>
                    </div>
                  </div>

                  <!-- Reason -->
                  ${
                    reason
                      ? `
                  <div style="background: #fff5f5; border-left: 4px solid #ef4444; border-radius: 0 12px 12px 0; padding: 16px 20px; margin-bottom: 24px;">
                    <p style="margin: 0 0 6px; color: #991b1b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Lý do từ chối</p>
                    <p style="margin: 0; color: #7f1d1d; font-size: 14px; line-height: 1.7;">${reason}</p>
                  </div>
                  `
                      : ""
                  }

                  <!-- Tips -->
                  <div style="background: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 0 12px 12px 0; padding: 16px 20px; margin-bottom: 28px;">
                    <p style="margin: 0 0 8px; color: #15803d; font-size: 13px; font-weight: 700;">💡 Bạn có thể làm gì?</p>
                    <ul style="margin: 0; padding-left: 18px; color: #166534; font-size: 13px; line-height: 1.8;">
                      <li>Đọc kỹ lý do từ chối bên trên</li>
                      <li>Chỉnh sửa tiêu đề, mô tả hoặc hình ảnh</li>
                      <li>Đảm bảo sản phẩm không vi phạm chính sách</li>
                      <li>Đăng lại sản phẩm sau khi đã cập nhật</li>
                    </ul>
                  </div>

                  <!-- CTA -->
                  <div style="text-align: center; margin-bottom: 8px;">
                    <a href="${sellUrl}" style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #8b7355 0%, #6b5a42 100%); color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(139,115,85,0.3);">
                      Đăng lại sản phẩm
                    </a>
                  </div>

                </td></tr>
                ${getEmailFooter()}
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });
    console.log("Email product rejected đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email product rejected:",
      error.response?.body || error,
    );
    throw error;
  }
};

/**
 * 9️⃣ Gửi email xác nhận thanh toán thành công
 */
const sendPaymentSuccessEmail = async (toEmail, userName, order) => {
  try {
    const orderUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/orders/${order._id}`;

    await apiInstance.sendTransacEmail({
      sender: { email: "rtwf0311@gmail.com", name: "Eco Market" },
      to: [{ email: toEmail }],
      subject: "✅ Thanh toán thành công - Eco Market",
      htmlContent: `
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; background: linear-gradient(135deg, #faf8f3 0%, #f5f1e8 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; padding: 40px 20px;">
            <tr><td align="center">
              <table role="presentation" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 24px; box-shadow: 0 10px 40px rgba(92, 84, 68, 0.08); overflow: hidden;">
                ${getEmailHeader()}
                <tr><td style="padding: 48px 40px;">
                  <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 80px; height: 80px; margin: 0 auto; background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                      <span style="font-size: 40px;">💳</span>
                    </div>
                  </div>
                  <h2 style="margin: 0 0 16px 0; color: #2d2416; font-size: 26px; font-weight: 700; text-align: center;">Thanh toán thành công!</h2>
                  <p style="margin: 0 0 32px 0; color: #5c5444; font-size: 16px; line-height: 1.6; text-align: center;">
                    Xin chào <strong>${userName || "bạn"}</strong>,<br>
                    Đơn hàng của bạn đã được thanh toán thành công.
                  </p>
                  
                  <div style="background: linear-gradient(135deg, #faf8f3 0%, #f5f1e8 100%); border-radius: 12px; padding: 24px; margin: 24px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 8px 0; color: #8b7355; font-size: 14px;">Mã đơn hàng:</td>
                        <td style="padding: 8px 0; color: #2d2416; font-size: 14px; font-weight: 700; text-align: right;">#${String(order._id).slice(-8)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-top: 1px solid #ede5d8; color: #8b7355; font-size: 14px;">Tổng tiền:</td>
                        <td style="padding: 8px 0; border-top: 1px solid #ede5d8; color: #2d2416; font-size: 20px; font-weight: 700; text-align: right;">${order.totalAmount?.toLocaleString("vi-VN")} ₫</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #8b7355; font-size: 14px;">Phương thức:</td>
                        <td style="padding: 8px 0; color: #2d2416; font-size: 14px; text-align: right;">${order.paymentMethod === "cod" ? "COD" : "Chuyển khoản"}</td>
                      </tr>
                    </table>
                  </div>
                  
                  <div style="background: #ecfdf5; border-left: 4px solid #10b981; border-radius: 12px; padding: 20px 24px; margin: 24px 0;">
                    <p style="margin: 0; color: #065f46; font-size: 14px; line-height: 1.7;">
                      <strong>📦 Tiếp theo:</strong><br>
                      • Người bán sẽ chuẩn bị hàng<br>
                      • Bạn sẽ nhận được thông báo khi đơn hàng được giao<br>
                      • Theo dõi đơn hàng qua link bên dưới
                    </p>
                  </div>
                  
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${orderUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #8b7355 0%, #6b5a42 100%); color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px;">
                      Theo dõi đơn hàng
                    </a>
                  </div>
                </td></tr>
                ${getEmailFooter()}
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });
    console.log("Email payment success đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email payment success:",
      error.response?.body || error,
    );
    throw error;
  }
};

/**
 * 9️⃣ Gửi email thông báo cho seller khi có đơn hàng mới
 */
const sendNewOrderToSellerEmail = async (toEmail, sellerName, order, buyer) => {
  try {
    const orderUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/seller/orders/${order._id}`;

    // Build product rows HTML
    const productRowsHtml = (order.products || [])
      .map((p) => {
        const product =
          p.productId && typeof p.productId === "object" ? p.productId : null;
        const name = product?.name || "Sản phẩm";
        const imageUrl =
          product?.avatar?.url || product?.images?.[0]?.url || null;
        const unitPrice = (p.price || 0).toLocaleString("vi-VN");
        const lineTotal = ((p.price || 0) * (p.quantity || 1)).toLocaleString(
          "vi-VN",
        );

        return `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #ede5d8; vertical-align: middle;">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${
                imageUrl
                  ? `<img src="${imageUrl}" alt="${name}" style="width: 52px; height: 52px; border-radius: 8px; object-fit: cover; border: 1px solid #e8ddd0; flex-shrink: 0;">`
                  : `<div style="width: 52px; height: 52px; border-radius: 8px; background: #f0ebe3; border: 1px solid #e8ddd0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 20px;">📦</div>`
              }
              <div style="min-width: 0;">
                <p style="margin: 0 0 3px 0; color: #2d2416; font-size: 14px; font-weight: 600; line-height: 1.4;">${name}</p>
                <p style="margin: 0; color: #8b7355; font-size: 12px;">Đơn giá: ${unitPrice} ₫</p>
              </div>
            </div>
          </td>
          <td style="padding: 12px 0 12px 16px; border-bottom: 1px solid #ede5d8; vertical-align: middle; text-align: center; white-space: nowrap;">
            <span style="display: inline-block; background: #f5f1e8; color: #6b5a42; font-size: 13px; font-weight: 600; padding: 4px 10px; border-radius: 20px;">x${p.quantity || 1}</span>
          </td>
          <td style="padding: 12px 0 12px 16px; border-bottom: 1px solid #ede5d8; vertical-align: middle; text-align: right; white-space: nowrap;">
            <span style="color: #2d2416; font-size: 14px; font-weight: 700;">${lineTotal} ₫</span>
          </td>
        </tr>
      `;
      })
      .join("");

    await apiInstance.sendTransacEmail({
      sender: { email: "rtwf0311@gmail.com", name: "Eco Market" },
      to: [{ email: toEmail }],
      subject: "🎉 Bạn có đơn hàng mới! - Eco Market",
      htmlContent: `
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; background: #f5f1e8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; padding: 32px 16px;">
            <tr><td align="center">
              <table role="presentation" style="max-width: 600px; width: 100%; background: #ffffff; border-radius: 20px; box-shadow: 0 8px 32px rgba(92,84,68,0.10); overflow: hidden;">

                ${getEmailHeader()}

                <!-- Alert banner -->
                <tr>
                  <td style="background: linear-gradient(135deg, #fffbf0 0%, #fff8ec 100%); border-bottom: 1px solid #f0e8d8; padding: 16px 32px; text-align: center;">
                    <p style="margin: 0; font-size: 22px;">🎉</p>
                    <h2 style="margin: 6px 0 4px; color: #2d2416; font-size: 20px; font-weight: 700;">Bạn có đơn hàng mới!</h2>
                    <p style="margin: 0; color: #8b7355; font-size: 14px;">Xin chào <strong>${sellerName || "Seller"}</strong>, có khách vừa đặt mua sản phẩm của bạn.</p>
                  </td>
                </tr>

                <tr><td style="padding: 28px 32px 0;">

                  <!-- ① Sản phẩm đặt mua -->
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
                        ${productRowsHtml || `<tr><td colspan="3" style="padding: 16px; text-align: center; color: #8b7355; font-size: 13px;">—</td></tr>`}
                      </tbody>
                    </table>
                    <!-- Totals -->
                    <div style="background: #faf8f3; border-top: 1.5px solid #e8ddd0; padding: 14px 16px;">
                      <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td style="font-size: 13px; color: #8b7355;">Tiền hàng</td>
                          <td style="font-size: 13px; color: #2d2416; font-weight: 600; text-align: right;">${(order.productAmount || 0).toLocaleString("vi-VN")} ₫</td>
                        </tr>
                        <tr>
                          <td style="font-size: 13px; color: #8b7355; padding-top: 6px;">Phí vận chuyển</td>
                          <td style="font-size: 13px; color: #2d2416; font-weight: 600; text-align: right; padding-top: 6px;">${(order.shippingFee || 0).toLocaleString("vi-VN")} ₫</td>
                        </tr>
                        <tr>
                          <td style="font-size: 15px; color: #2d2416; font-weight: 700; padding-top: 10px; border-top: 1px dashed #d4c4ab;">Tổng đơn hàng</td>
                          <td style="font-size: 18px; color: #8b7355; font-weight: 800; text-align: right; padding-top: 10px; border-top: 1px dashed #d4c4ab;">${(order.totalAmount || 0).toLocaleString("vi-VN")} ₫</td>
                        </tr>
                      </table>
                    </div>
                  </div>

                  <!-- ② Thông tin đơn hàng -->
                  <h3 style="margin: 0 0 14px 0; color: #6b5a42; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">🗒️ Thông tin đơn hàng</h3>
                  <div style="border: 1.5px solid #e8ddd0; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr style="border-bottom: 1px solid #f0e8d8;">
                        <td style="padding: 11px 16px; font-size: 13px; color: #8b7355; width: 40%;">Mã đơn hàng</td>
                        <td style="padding: 11px 16px; font-size: 13px; color: #2d2416; font-weight: 700; font-family: monospace;">#${String(order._id).slice(-10).toUpperCase()}</td>
                      </tr>
                      <tr style="border-bottom: 1px solid #f0e8d8; background: #fdfcfa;">
                        <td style="padding: 11px 16px; font-size: 13px; color: #8b7355;">Thanh toán</td>
                        <td style="padding: 11px 16px; font-size: 13px; color: #2d2416; font-weight: 600;">${order.paymentMethod === "cod" ? "💵 COD (Thu tiền khi giao)" : "🏦 Chuyển khoản ngân hàng"}</td>
                      </tr>
                      <tr>
                        <td style="padding: 11px 16px; font-size: 13px; color: #8b7355;">Vận chuyển</td>
                        <td style="padding: 11px 16px; font-size: 13px; color: #2d2416; font-weight: 600;">${order.shippingMethod || "GHN"}</td>
                      </tr>
                    </table>
                  </div>

                  <!-- ③ Thông tin người mua -->
                  ${
                    buyer
                      ? `
                  <h3 style="margin: 0 0 14px 0; color: #6b5a42; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">👤 Người mua</h3>
                  <div style="border: 1.5px solid #e8ddd0; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr style="border-bottom: 1px solid #f0e8d8;">
                        <td style="padding: 11px 16px; font-size: 13px; color: #8b7355; width: 40%;">Họ tên</td>
                        <td style="padding: 11px 16px; font-size: 13px; color: #2d2416; font-weight: 600;">${buyer.fullName || "—"}</td>
                      </tr>
                      ${
                        buyer.phoneNumber
                          ? `
                      <tr style="border-bottom: 1px solid #f0e8d8; background: #fdfcfa;">
                        <td style="padding: 11px 16px; font-size: 13px; color: #8b7355;">Số điện thoại</td>
                        <td style="padding: 11px 16px; font-size: 13px; color: #2d2416; font-weight: 600;">${buyer.phoneNumber}</td>
                      </tr>
                      `
                          : ""
                      }
                      ${
                        buyer.email
                          ? `
                      <tr>
                        <td style="padding: 11px 16px; font-size: 13px; color: #8b7355;">Email</td>
                        <td style="padding: 11px 16px; font-size: 13px; color: #2d2416; font-weight: 600;">${buyer.email}</td>
                      </tr>
                      `
                          : ""
                      }
                    </table>
                  </div>
                  `
                      : ""
                  }

                  <!-- CTA -->
                  <div style="text-align: center; padding: 8px 0 28px;">
                    <a href="${orderUrl}" style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #8b7355 0%, #6b5a42 100%); color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(139,115,85,0.3); letter-spacing: 0.2px;">
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
      `,
    });
    console.log("Email new order to seller đã gửi tới:", toEmail);
  } catch (error) {
    console.error("Lỗi gửi email new order:", error.response?.body || error);
    throw error;
  }
};

/**
 * Gửi email thông báo sản phẩm đang được admin xem xét thủ công
 */
const sendProductUnderReviewEmail = async (toEmail, userName, product) => {
  try {
    const listingsUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/my/listings`;

    await apiInstance.sendTransacEmail({
      sender: { email: "rtwf0311@gmail.com", name: "Eco Market" },
      to: [{ email: toEmail }],
      subject: "🔍 Sản phẩm đang được xem xét - Eco Market",
      htmlContent: `
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; background: linear-gradient(135deg, #faf8f3 0%, #f5f1e8 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; padding: 40px 20px;">
            <tr><td align="center">
              <table role="presentation" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 24px; box-shadow: 0 10px 40px rgba(92, 84, 68, 0.08); overflow: hidden;">
                ${getEmailHeader()}
                <tr><td style="padding: 48px 40px;">
                  <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 80px; height: 80px; margin: 0 auto; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                      <span style="font-size: 40px;">🔍</span>
                    </div>
                  </div>
                  <h2 style="margin: 0 0 16px 0; color: #2d2416; font-size: 24px; font-weight: 700; text-align: center;">Sản phẩm đang được xem xét</h2>
                  <p style="margin: 0 0 28px 0; color: #5c5444; font-size: 15px; line-height: 1.6; text-align: center;">
                    Xin chào <strong>${userName || "bạn"}</strong>,<br>
                    Sản phẩm "<strong>${product.name}</strong>" đang được đội ngũ kiểm duyệt xem xét thủ công.
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
                ${getEmailFooter()}
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });
    console.log("Email product under_review đã gửi tới:", toEmail);
  } catch (error) {
    console.error(
      "Lỗi gửi email product under_review:",
      error.response?.body || error,
    );
    throw error;
  }
}

// ── Order Shipped ────────────────────────────────────────────────────────────
const sendOrderShippedEmail = async (toEmail, userName, order) => {
  try {
    const orderUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/orders/${order._id}`;
    const shortId = String(order._id).slice(-8).toUpperCase();
    const expected = order.expectedDeliveryTime
      ? new Date(order.expectedDeliveryTime).toLocaleDateString("vi-VN", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        })
      : null;

    await apiInstance.sendTransacEmail({
      sender: { email: "rtwf0311@gmail.com", name: "Eco Market" },
      to: [{ email: toEmail }],
      subject: "🚚 Đơn hàng đang được giao - Eco Market",
      htmlContent: `
        <!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/></head>
        <body style="font-family:Arial,sans-serif;background:#f9f5f0;padding:24px;margin:0">
          <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #ede5d8">
            <div style="background:#1a1714;padding:24px 28px">
              <h1 style="color:#fff;margin:0;font-size:22px">🚚 Đơn hàng đang trên đường đến bạn!</h1>
            </div>
            <div style="padding:28px">
              <p style="color:#3d3530;margin:0 0 12px">Xin chào <strong>${userName || "bạn"}</strong>,</p>
              <p style="color:#5c4f46;margin:0 0 20px">Đơn hàng <strong>#${shortId}</strong> đã được giao cho đơn vị vận chuyển và đang trên đường đến bạn.</p>
              ${expected ? `<p style="color:#5c4f46;margin:0 0 20px">📅 Dự kiến giao: <strong>${expected}</strong></p>` : ""}
              <a href="${orderUrl}" style="display:inline-block;background:#1a1714;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Theo dõi đơn hàng</a>
            </div>
          </div>
        </body></html>
      `,
    });
  } catch (error) {
    console.error(
      "Lỗi gửi email order shipped:",
      error.response?.body || error,
    );
  }
};

// ── Refund Approved ──────────────────────────────────────────────────────────
const sendRefundApprovedEmail = async (toEmail, userName, order) => {
  try {
    const orderUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/orders/${order._id}`;
    const shortId = String(order._id).slice(-8).toUpperCase();

    await apiInstance.sendTransacEmail({
      sender: { email: "rtwf0311@gmail.com", name: "Eco Market" },
      to: [{ email: toEmail }],
      subject: "✅ Yêu cầu hoàn tiền được chấp thuận - Eco Market",
      htmlContent: `
        <!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/></head>
        <body style="font-family:Arial,sans-serif;background:#f9f5f0;padding:24px;margin:0">
          <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #ede5d8">
            <div style="background:#1a1714;padding:24px 28px">
              <h1 style="color:#fff;margin:0;font-size:22px">✅ Hoàn tiền được chấp thuận</h1>
            </div>
            <div style="padding:28px">
              <p style="color:#3d3530;margin:0 0 12px">Xin chào <strong>${userName || "bạn"}</strong>,</p>
              <p style="color:#5c4f46;margin:0 0 12px">Yêu cầu hoàn tiền cho đơn hàng <strong>#${shortId}</strong> đã được chấp thuận.</p>
              <p style="color:#5c4f46;margin:0 0 20px">Số tiền hoàn lại: <strong style="color:#c47b5a">${(order.totalAmount || 0).toLocaleString("vi-VN")}₫</strong></p>
              <a href="${orderUrl}" style="display:inline-block;background:#1a1714;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Xem chi tiết đơn hàng</a>
            </div>
          </div>
        </body></html>
      `,
    });
  } catch (error) {
    console.error(
      "Lỗi gửi email refund approved:",
      error.response?.body || error,
    );
  }
};

// ── Payout Released ──────────────────────────────────────────────────────────
const sendPayoutReleasedEmail = async (
  toEmail,
  sellerName,
  order,
  netAmount,
) => {
  try {
    const walletUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/seller/wallet`;
    const shortId = String(order._id).slice(-8).toUpperCase();

    await apiInstance.sendTransacEmail({
      sender: { email: "rtwf0311@gmail.com", name: "Eco Market" },
      to: [{ email: toEmail }],
      subject: "💰 Thanh toán đã được giải ngân - Eco Market",
      htmlContent: `
        <!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"/></head>
        <body style="font-family:Arial,sans-serif;background:#f9f5f0;padding:24px;margin:0">
          <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #ede5d8">
            <div style="background:#1a1714;padding:24px 28px">
              <h1 style="color:#fff;margin:0;font-size:22px">💰 Doanh thu đã được cộng vào ví</h1>
            </div>
            <div style="padding:28px">
              <p style="color:#3d3530;margin:0 0 12px">Xin chào <strong>${sellerName || "bạn"}</strong>,</p>
              <p style="color:#5c4f46;margin:0 0 12px">Đơn hàng <strong>#${shortId}</strong> đã hoàn tất. Doanh thu đã được giải ngân vào ví của bạn.</p>
              <p style="color:#5c4f46;margin:0 0 20px">Số tiền nhận được: <strong style="color:#c47b5a">${(netAmount || 0).toLocaleString("vi-VN")}₫</strong></p>
              <a href="${walletUrl}" style="display:inline-block;background:#1a1714;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Xem ví của tôi</a>
            </div>
          </div>
        </body></html>
      `,
    });
  } catch (error) {
    console.error(
      "Lỗi gửi email payout released:",
      error.response?.body || error,
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
  sendProductListedEmail,
  sendProductApprovedEmail,
  sendProductRejectedEmail,
  sendProductUnderReviewEmail,
  sendPaymentSuccessEmail,
  sendNewOrderToSellerEmail,
  sendOrderShippedEmail,
  sendRefundApprovedEmail,
  sendPayoutReleasedEmail,
};
