




const Notification = require("../models/Notification");








async function saveAndEmitNotification(io, userId, notification) {
  try {
    const metadata =
    notification.metadata || (
    notification.orderId ?
    { orderId: notification.orderId } :
    notification.productId ?
    { productId: notification.productId } :
    {});

    const saved = await Notification.create({
      userId,
      type: notification.type || "system",
      title: notification.title,
      message: notification.message,
      link: notification.link,
      metadata
    });

    if (io && userId) {
      const event =
      notification.type === "product" ? "product-notification" : "order-notification";
      io.to(userId.toString()).emit(event, {
        ...notification,
        _id: saved._id
      });
    }

    return saved;
  } catch (e) {
    console.error("[notification] Failed to save/emit:", e.message);
  }
}
















async function notifyUser({ io, userId, type, title, message, link, metadata, realtime = true, email = false, emailFn }) {
  if (!userId) return;

  const promises = [];

  if (realtime) {
    promises.push(
      saveAndEmitNotification(io, userId, { type, title, message, link, metadata }).catch(
        (e) => console.error("[notifyUser realtime]", e.message)
      )
    );
  }

  if (email && typeof emailFn === "function") {
    promises.push(
      emailFn().catch((e) => console.error("[notifyUser email]", e.message))
    );
  }

  await Promise.all(promises);
}

module.exports = { saveAndEmitNotification, notifyUser };