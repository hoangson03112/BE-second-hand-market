/**
 * Shared notification helper
 * Lưu vào DB và emit socket realtime cho user.
 * Dùng chung cho tất cả các module: order, product, seller, admin...
 */
const Notification = require("../models/Notification");

/**
 * Save to DB and emit via Socket.IO.
 *
 * @param {import('socket.io').Server|null} io
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {{ type?: string, title: string, message: string, link?: string, metadata?: object, orderId?: unknown, productId?: unknown }} notification
 */
async function saveAndEmitNotification(io, userId, notification) {
  try {
    const metadata =
      notification.metadata ||
      (notification.orderId
        ? { orderId: notification.orderId }
        : notification.productId
          ? { productId: notification.productId }
          : {});

    const saved = await Notification.create({
      userId,
      type: notification.type || "system",
      title: notification.title,
      message: notification.message,
      link: notification.link,
      metadata,
    });

    if (io && userId) {
      const event =
        notification.type === "product" ? "product-notification" : "order-notification";
      io.to(userId.toString()).emit(event, {
        ...notification,
        _id: saved._id,
      });
    }

    return saved;
  } catch (e) {
    console.error("[notification] Failed to save/emit:", e.message);
  }
}

/**
 * Unified notification dispatcher.
 *
 * @param {object} opts
 * @param {import('socket.io').Server|null} opts.io         - Socket.IO instance (from req.app.get("io"))
 * @param {string|object}  opts.userId                     - Target user ID
 * @param {string}         opts.type                       - Notification type ("order"|"product"|"system")
 * @param {string}         opts.title
 * @param {string}         opts.message
 * @param {string}         [opts.link]                     - Frontend URL to navigate to
 * @param {object}         [opts.metadata]
 * @param {boolean}        [opts.realtime=true]            - Emit via socket + save to DB
 * @param {boolean}        [opts.email=false]              - Send email
 * @param {Function}       [opts.emailFn]                  - Async () => void, called when email=true
 */
async function notifyUser({ io, userId, type, title, message, link, metadata, realtime = true, email = false, emailFn }) {
  if (!userId) return;

  const promises = [];

  if (realtime) {
    promises.push(
      saveAndEmitNotification(io, userId, { type, title, message, link, metadata }).catch(
        (e) => console.error("[notifyUser realtime]", e.message),
      ),
    );
  }

  if (email && typeof emailFn === "function") {
    promises.push(
      emailFn().catch((e) => console.error("[notifyUser email]", e.message)),
    );
  }

  await Promise.all(promises);
}

module.exports = { saveAndEmitNotification, notifyUser };
