const Notification = require("../../models/Notification");
const { MESSAGES } = require('../../utils/messages');

const PAGE_SIZE = 20;

class NotificationController {
  /**
   * GET /notifications
   * Lấy danh sách thông báo của user hiện tại (phân trang)
   */
  async getMyNotifications(req, res) {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || PAGE_SIZE);
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ userId: req.accountID })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ userId: req.accountID }),
      Notification.countDocuments({ userId: req.accountID, read: false }),
    ]);

    return res.json({
      notifications,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      unreadCount,
    });
  }

  /**
   * PATCH /notifications/read/:id
   * Đánh dấu 1 thông báo đã đọc
   */
  async markAsRead(req, res) {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.accountID },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: MESSAGES.NOTIFICATION.NOT_FOUND });
    }

    return res.json({ notification });
  }

  /**
   * PATCH /notifications/read-all
   * Đánh dấu tất cả thông báo đã đọc
   */
  async markAllAsRead(req, res) {
    await Notification.updateMany({ userId: req.accountID, read: false }, { read: true });
    return res.json({ message: MESSAGES.NOTIFICATION.MARK_ALL_READ });
  }

  /**
   * DELETE /notifications/:id
   * Xóa 1 thông báo
   */
  async deleteNotification(req, res) {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.accountID,
    });

    if (!notification) {
      return res.status(404).json({ message: MESSAGES.NOTIFICATION.NOT_FOUND });
    }

    return res.json({ message: MESSAGES.NOTIFICATION.DELETE_SUCCESS });
  }
}

module.exports = new NotificationController();
