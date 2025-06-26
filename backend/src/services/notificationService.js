class NotificationService {
  constructor() {
    this.emailService = null; // Có thể tích hợp Nodemailer, SendGrid, etc.
    this.pushService = null;  // Có thể tích hợp Firebase, Pusher, etc.
  }

  // Gửi thông báo về kết quả AI moderation
  async notifyModerationResult(product, status, moderationResult) {
    try {
      const seller = product.sellerId;
      const notification = this.createNotificationContent(product, status, moderationResult);

      // Log notification (hiện tại)
      console.log(`🔔 Notification for ${seller.email}:`, notification.message);

      // TODO: Implement các phương thức gửi thông báo
      await Promise.all([
        this.sendInAppNotification(seller._id, notification),
        // this.sendEmail(seller.email, notification),
        // this.sendPushNotification(seller._id, notification),
        // this.sendSMS(seller.phone, notification)
      ]);

      return true;
    } catch (error) {
      console.error('Failed to send notification:', error);
      return false;
    }
  }

  // Tạo nội dung thông báo
  createNotificationContent(product, status, moderationResult) {
    const baseContent = {
      productId: product._id,
      productName: product.name,
      status: status,
      timestamp: new Date()
    };

    switch (status) {
      case 'active':
        return {
          ...baseContent,
          type: 'success',
          title: '🎉 Sản phẩm đã được duyệt!',
          message: `Sản phẩm "${product.name}" đã được duyệt và đang hiển thị trên thị trường. Chúc bạn bán hàng thành công!`,
          action: {
            text: 'Xem sản phẩm',
            url: `/products/${product._id}`
          },
          metadata: {
            confidence: moderationResult.confidence,
            cost: moderationResult.totalCost
          }
        };

      case 'rejected':
        return {
          ...baseContent,
          type: 'error',
          title: '❌ Sản phẩm bị từ chối',
          message: `Sản phẩm "${product.name}" không được duyệt vì: ${moderationResult.reasons.join(', ')}. Vui lòng chỉnh sửa và đăng lại.`,
          action: {
            text: 'Chỉnh sửa sản phẩm',
            url: `/products/${product._id}/edit`
          },
          metadata: {
            reasons: moderationResult.reasons,
            canResubmit: true
          }
        };

      case 'under_review':
        return {
          ...baseContent,
          type: 'warning',
          title: '⏳ Sản phẩm cần xem xét thủ công',
          message: `Sản phẩm "${product.name}" đang được kiểm tra thủ công bởi đội ngũ quản trị. Chúng tôi sẽ phản hồi trong vòng 24h.`,
          action: {
            text: 'Xem chi tiết',
            url: `/products/${product._id}`
          },
          metadata: {
            estimatedReviewTime: '24 hours'
          }
        };

      default:
        return {
          ...baseContent,
          type: 'info',
          title: 'Cập nhật trạng thái sản phẩm',
          message: `Trạng thái sản phẩm "${product.name}" đã được cập nhật: ${status}`,
          action: null
        };
    }
  }

  // In-app notification (lưu vào database để hiển thị trong app)
  async sendInAppNotification(userId, notification) {
    try {
      // TODO: Implement in-app notification
      // - Lưu vào database notifications table
      // - Gửi qua WebSocket/Socket.IO cho real-time
      
      console.log(`📱 In-app notification for user ${userId}:`, {
        title: notification.title,
        type: notification.type
      });

      return true;
    } catch (error) {
      console.error('Failed to send in-app notification:', error);
      return false;
    }
  }

  // Email notification
  async sendEmail(email, notification) {
    try {
      // TODO: Implement email service
      // - Nodemailer
      // - SendGrid
      // - AWS SES
      
      console.log(`📧 Email notification to ${email}:`, notification.title);
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  // Push notification
  async sendPushNotification(userId, notification) {
    try {
      // TODO: Implement push notification
      // - Firebase Cloud Messaging
      // - Pusher
      // - OneSignal
      
      console.log(`📲 Push notification for user ${userId}:`, notification.title);
      return true;
    } catch (error) {
      console.error('Failed to send push notification:', error);
      return false;
    }
  }

  // SMS notification (optional)
  async sendSMS(phone, notification) {
    try {
      // TODO: Implement SMS service
      // - Twilio
      // - AWS SNS
      
      if (phone) {
        console.log(`📱 SMS to ${phone}:`, notification.message.substring(0, 100));
      }
      return true;
    } catch (error) {
      console.error('Failed to send SMS:', error);
      return false;
    }
  }

  // Notification cho admin khi có sản phẩm cần review
  async notifyAdminReview(product) {
    try {
      console.log(`👨‍💼 Admin notification: Product ${product._id} needs manual review`);
      
      // TODO: Implement admin notification
      // - Slack webhook
      // - Discord webhook  
      // - Email to admin team
      // - Dashboard notification
      
      return true;
    } catch (error) {
      console.error('Failed to notify admin:', error);
      return false;
    }
  }
}

module.exports = new NotificationService(); 