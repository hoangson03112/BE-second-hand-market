class NotificationService {
  constructor() {
    this.emailService = null;
    this.pushService = null;
  }

  async notifyModerationResult(product, status, moderationResult) {
    try {
      const seller = product.sellerId;
      const notification = this.createNotificationContent(
        product,
        status,
        moderationResult
      );


      await Promise.all([
      this.sendInAppNotification(seller._id, notification)]

      );

      return true;
    } catch (error) {
      console.error("Failed to send notification:", error);
      return false;
    }
  }


  createNotificationContent(product, status, moderationResult) {
    const baseContent = {
      productId: product._id,
      productName: product.name,
      status: status,
      timestamp: new Date()
    };

    switch (status) {
      case "active":
        return {
          ...baseContent,
          type: "success",
          title: "🎉 Sản phẩm đã được duyệt!",
          message: `Sản phẩm "${product.name}" đã được duyệt và đang hiển thị trên thị trường. Chúc bạn bán hàng thành công!`,
          action: {
            text: "Xem sản phẩm",
            url: `/products/${product._id}`
          },
          metadata: {
            confidence: moderationResult.confidence,
            cost: moderationResult.totalCost
          }
        };

      case "rejected":
        return {
          ...baseContent,
          type: "error",
          title: "❌ Sản phẩm bị từ chối",
          message: `Sản phẩm "${product.name}" không được duyệt vì: ${moderationResult.reasons.join(", ")}. Vui lòng chỉnh sửa và đăng lại.`,
          action: {
            text: "Chỉnh sửa sản phẩm",
            url: `/products/${product._id}/edit`
          },
          metadata: {
            reasons: moderationResult.reasons,
            canResubmit: true
          }
        };

      case "under_review":
        return {
          ...baseContent,
          type: "warning",
          title: "⏳ Sản phẩm cần xem xét thủ công",
          message: `Sản phẩm "${product.name}" đang được kiểm tra thủ công bởi đội ngũ quản trị. Chúng tôi sẽ phản hồi trong vòng 24h.`,
          action: {
            text: "Xem chi tiết",
            url: `/products/${product._id}`
          },
          metadata: {
            estimatedReviewTime: "24 hours"
          }
        };

      default:
        return {
          ...baseContent,
          type: "info",
          title: "Cập nhật trạng thái sản phẩm",
          message: `Trạng thái sản phẩm "${product.name}" đã được cập nhật: ${status}`,
          action: null
        };
    }
  }


  async sendInAppNotification(userId, notification) {
    try {




      console.log(`📱 In-app notification for user ${userId}:`, {
        title: notification.title,
        type: notification.type
      });

      return true;
    } catch (error) {
      console.error("Failed to send in-app notification:", error);
      return false;
    }
  }


  async sendEmail(email, notification) {
    try {

      const { sendOtpEmail } = require('./email.service');


      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #10b981;">${notification.title}</h2>
          <p>${notification.message}</p>
          ${notification.action ? `<a href="${notification.action.url}" style="display: inline-block; padding: 12px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px;">${notification.action.text}</a>` : ''}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">Email từ Eco Market. Không trả lời email này.</p>
        </div>
      `;

      console.log(`📧 Email notification to ${email}:`, notification.title);

      return true;
    } catch (error) {
      console.error("Failed to send email:", error);
      return false;
    }
  }


  async sendPushNotification(userId, notification) {
    try {





      console.log(
        `📲 Push notification for user ${userId}:`,
        notification.title
      );
      return true;
    } catch (error) {
      console.error("Failed to send push notification:", error);
      return false;
    }
  }


  async sendSMS(phone, notification) {
    try {




      if (phone) {
        console.log(
          `📱 SMS to ${phone}:`,
          notification.message.substring(0, 100)
        );
      }
      return true;
    } catch (error) {
      console.error("Failed to send SMS:", error);
      return false;
    }
  }


  async notifyAdminReview(product) {
    try {
      console.log(
        `👨‍💼 Admin notification: Product ${product._id} needs manual review`
      );







      return true;
    } catch (error) {
      console.error("Failed to notify admin:", error);
      return false;
    }
  }
}

module.exports = new NotificationService();