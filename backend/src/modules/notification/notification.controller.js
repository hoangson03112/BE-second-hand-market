const Notification = require("../../models/Notification");
const Account = require("../../models/Account");
const NotificationBroadcast = require("../../models/NotificationBroadcast");
const { MESSAGES } = require('../../utils/messages');

const PAGE_SIZE = 20;
const ALLOWED_TARGET_ROLES = ["buyer", "seller", "admin"];

function parsePaginationParams(query, defaultLimit = PAGE_SIZE, maxLimit = 50) {
  const page = Math.max(1, Number.parseInt(String(query?.page ?? "1"), 10) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number.parseInt(String(query?.limit ?? String(defaultLimit)), 10) || defaultLimit),
  );
  return { page, limit, skip: (page - 1) * limit };
}

function parseTargetRoles(rawRoles) {
  const defaultRoles = ["buyer", "seller"];
  if (!Array.isArray(rawRoles)) return defaultRoles;
  const roles = rawRoles
    .filter((role) => typeof role === "string")
    .map((role) => role.trim().toLowerCase())
    .filter((role) => ALLOWED_TARGET_ROLES.includes(role));
  return roles.length > 0 ? roles : defaultRoles;
}

function parseDateFilter(query) {
  const startDate = query?.startDate ? new Date(String(query.startDate)) : null;
  const endDate = query?.endDate ? new Date(String(query.endDate)) : null;
  const filter = {};

  if (startDate && Number.isFinite(startDate.getTime())) {
    filter.createdAt = { ...(filter.createdAt || {}), $gte: startDate };
  }
  if (endDate && Number.isFinite(endDate.getTime())) {
    filter.createdAt = { ...(filter.createdAt || {}), $lte: endDate };
  }

  return filter;
}

class NotificationController {
  /**
   * GET /notifications
   * Lấy danh sách thông báo của user hiện tại (phân trang)
   */
  async getMyNotifications(req, res) {
    const { page, limit, skip } = parsePaginationParams(req.query);

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

  /**
   * POST /notifications/admin/broadcast
   * Admin tạo thông báo hệ thống gửi đến toàn bộ user.
   */
  async broadcastSystemNotification(req, res) {
    const io = req.app.get("io");
    const title = String(req.body?.title || "").trim();
    const message = String(req.body?.message || "").trim();
    const link = typeof req.body?.link === "string" ? req.body.link.trim() : "";
    const targetRoles = parseTargetRoles(req.body?.targetRoles);

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "title và message là bắt buộc",
      });
    }

    const users = await Account.find({
      role: { $in: targetRoles },
      status: "active",
    })
      .select("_id")
      .lean();

    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        message: "Không có user phù hợp để gửi thông báo.",
        sentCount: 0,
      });
    }

    const now = new Date();
    const docs = users.map((u) => ({
      userId: u._id,
      type: "system",
      title,
      message,
      link: link || undefined,
      read: false,
      metadata: {
        source: "admin-broadcast",
        createdBy: req.accountID,
      },
      createdAt: now,
      updatedAt: now,
    }));

    await Notification.insertMany(docs, { ordered: false });
    await NotificationBroadcast.create({
      title,
      message,
      link: link || "",
      targetRoles,
      sentCount: users.length,
      createdBy: req.accountID,
    });

    if (io) {
      const payload = {
        type: "system",
        title,
        message,
        link: link || undefined,
        createdAt: now,
      };
      users.forEach((u) => {
        io.to(String(u._id)).emit("system-notification", payload);
      });
    }

    return res.status(201).json({
      success: true,
      message: "Đã gửi thông báo hệ thống.",
      sentCount: users.length,
    });
  }

  /**
   * GET /notifications/admin/broadcast-history
   * Admin xem lịch sử broadcast + filter theo thời gian.
   */
  async getBroadcastHistory(req, res) {
    const { page, limit, skip } = parsePaginationParams(req.query, 20, 50);
    const filter = parseDateFilter(req.query);

    const [data, total] = await Promise.all([
      NotificationBroadcast.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "fullName email")
        .lean(),
      NotificationBroadcast.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }
}

module.exports = new NotificationController();
