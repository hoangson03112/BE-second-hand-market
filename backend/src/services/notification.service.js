const {
  sendOrderPlacedEmail,
  sendOrderShippedEmail,
  sendRefundApprovedEmail,
  sendPayoutReleasedEmail,
} = require("./email.service");
("use strict");

/**
 * NotificationService
 *
 * Single place for all business-event notifications.
 * Each method knows:
 *   - WHO to notify (buyer, seller, both)
 *   - WHAT channel to use (realtime, email, both)
 *   - WHAT message to show
 *
 * Controllers/services just call e.g.:
 *   NotificationService.orderCreated({ io, order })
 *
 * Account fetching is done internally so callers never need to worry about it.
 */

const Account = require("../models/Account");
const { notifyUser } = require("../utils/notification");

// ─── helpers ────────────────────────────────────────────────────────────────

function sid(order) {
  return String(order._id).slice(-8).toUpperCase();
}

function fire(io, userId, opts) {
  if (!userId) return Promise.resolve();
  return notifyUser({ io, userId, ...opts }).catch((e) =>
    console.error("[NotificationService]", e.message),
  );
}

// ─── service ────────────────────────────────────────────────────────────────

const NotificationService = {
  /**
   * Order placed.
   * Buyer  → realtime + email (order confirmation)
   * Seller → realtime only
   */
  async orderCreated({ io, order }) {
    const id = sid(order);
    const [buyer] = await Promise.all([Account.findById(order.buyerId).lean()]);
    return Promise.all([
      fire(io, order.buyerId, {
        type: "order",
        realtime: true,
        email: true,
        title: "Đặt hàng thành công!",
        message: `Đơn hàng #${id} đã được đặt. Chờ người bán xác nhận.`,
        link: `/orders/${order._id}`,
        orderId: order._id,
        emailFn: () =>
          sendOrderPlacedEmail(buyer?.email, buyer?.fullName, order),
      }),
      fire(io, order.sellerId, {
        type: "order",
        realtime: true,
        email: false,
        title: "Đơn hàng mới!",
        message: `Bạn có đơn hàng mới #${id} từ ${buyer?.fullName || "người mua"}.`,
        link: `/seller/orders/${order._id}`,
        orderId: order._id,
      }),
    ]);
  },

  /**
   * Order status changed (confirmed / out_for_delivery / delivered / completed …).
   * Buyer → realtime only.
   * Does NOT cover: shipping (→ orderShipped), cancelled (→ orderCancelled).
   */
  async orderStatusChanged({ io, order, newStatus }) {
    const id = sid(order);
    const msgs = {
      confirmed: {
        title: "Đơn hàng đã xác nhận",
        message: `Người bán đã xác nhận đơn #${id}.`,
      },
      picked_up: {
        title: "Đơn hàng đã được lấy hàng",
        message: `Đơn hàng #${id} đã được lấy hàng.`,
      },
      out_for_delivery: {
        title: "Đơn hàng đang giao",
        message: `Đơn hàng #${id} đang trên đường đến bạn.`,
      },
      delivered: {
        title: "Đơn hàng đã giao",
        message: `Đơn hàng #${id} đã được giao thành công.`,
      },
      completed: {
        title: "Đơn hàng hoàn tất",
        message: `Đơn hàng #${id} đã hoàn tất.`,
      },
      delivery_failed: {
        title: "Giao hàng thất bại",
        message: `Giao hàng cho đơn #${id} thất bại. Sẽ thử lại sớm.`,
      },
      returning: {
        title: "Đơn hàng đang được hoàn trả",
        message: `Đơn hàng #${id} đang được hoàn trả lại người bán.`,
      },
      returned: {
        title: "Đơn hàng đã hoàn trả",
        message: `Đơn hàng #${id} đã hoàn trả về người bán.`,
      },
    }[newStatus] ?? {
      title: "Cập nhật đơn hàng",
      message: `Đơn hàng #${id} cập nhật: ${newStatus}.`,
    };

    return fire(io, order.buyerId, {
      type: "order",
      realtime: true,
      email: false,
      ...msgs,
      link: `/orders/${order._id}`,
      orderId: order._id,
    });
  },

  /**
   * Order shipped (handed to carrier).
   * Buyer → realtime + email.
   */
  async orderShipped({ io, order }) {
    const id = sid(order);
    const buyer = await Account.findById(order.buyerId).lean();
    return fire(io, order.buyerId, {
      type: "order",
      realtime: true,
      email: true,
      title: "Đơn hàng đang vận chuyển",
      message: `Đơn hàng #${id} đã được giao cho đơn vị vận chuyển.`,
      link: `/orders/${order._id}`,
      orderId: order._id,
      emailFn: () =>
        sendOrderShippedEmail(buyer?.email, buyer?.fullName, order),
    });
  },

  /**
   * Order cancelled.
   * Buyer  → realtime only
   * Seller → realtime only
   */
  async orderCancelled({ io, order, reason }) {
    const id = sid(order);
    const msg = reason || "Không có lý do";
    return Promise.all([
      fire(io, order.buyerId, {
        type: "order",
        realtime: true,
        email: false,
        title: "Đơn hàng đã bị hủy",
        message: `Đơn hàng #${id} đã bị hủy. Lý do: ${msg}.`,
        link: `/orders/${order._id}`,
        orderId: order._id,
      }),
      fire(io, order.sellerId, {
        type: "order",
        realtime: true,
        email: false,
        title: "Đơn hàng đã bị hủy",
        message: `Đơn hàng #${id} đã bị hủy. Lý do: ${msg}.`,
        link: `/seller/orders/${order._id}`,
        orderId: order._id,
      }),
    ]);
  },

  /**
   * Buyer confirmed receipt → order completed.
   * Seller → realtime only (payout will trigger its own separate notification).
   */
  async orderCompleted({ io, order }) {
    const id = sid(order);
    return fire(io, order.sellerId, {
      type: "order",
      realtime: true,
      email: false,
      title: "Đơn hàng hoàn tất",
      message: `Người mua đã xác nhận nhận hàng cho đơn #${id}. Doanh thu đang được giải ngân.`,
      link: `/seller/orders/${order._id}`,
      orderId: order._id,
    });
  },

  /**
   * Admin confirmed bank transfer.
   * Buyer  → realtime only
   * Seller → realtime only
   */
  async bankTransferConfirmed({ io, order }) {
    const id = sid(order);
    return Promise.all([
      fire(io, order.buyerId, {
        type: "order",
        realtime: true,
        email: false,
        title: "Thanh toán đã xác nhận",
        message: `Chuyển khoản cho đơn hàng #${id} đã được xác nhận.`,
        link: `/orders/${order._id}`,
        orderId: order._id,
      }),
      fire(io, order.sellerId, {
        type: "order",
        realtime: true,
        email: false,
        title: "Đã nhận thanh toán",
        message: `Thanh toán cho đơn hàng #${id} đã được xác nhận.`,
        link: `/seller/orders/${order._id}`,
        orderId: order._id,
      }),
    ]);
  },

  /**
   * COD payment confirmed.
   * Seller → realtime only.
   */
  async codConfirmed({ io, order }) {
    const id = sid(order);
    return fire(io, order.sellerId, {
      type: "order",
      realtime: true,
      email: false,
      title: "Thanh toán COD đã ghi nhận",
      message: `Thanh toán COD cho đơn hàng #${id} đã được xác nhận.`,
      link: `/seller/orders/${order._id}`,
      orderId: order._id,
    });
  },

  /**
   * Buyer requested a refund.
   * Seller → realtime only.
   */
  async refundRequested({ io, order }) {
    const id = sid(order);
    return fire(io, order.sellerId, {
      type: "order",
      realtime: true,
      email: false,
      title: "Yêu cầu hoàn tiền",
      message: `Người mua yêu cầu hoàn tiền cho đơn hàng #${id}.`,
      link: `/seller/orders/${order._id}`,
      orderId: order._id,
    });
  },

  /**
   * Seller approved the refund request → buyer needs to ship item back.
   * Buyer → realtime + email.
   */
  async refundApproved({ io, order }) {
    const id = sid(order);
    const buyer = await Account.findById(order.buyerId).lean();
    return fire(io, order.buyerId, {
      type: "order",
      realtime: true,
      email: true,
      title: "Yêu cầu hoàn tiền được chấp thuận",
      message: `Người bán đã chấp thuận hoàn tiền đơn #${id}. Vui lòng gửi lại hàng theo vận đơn GHN đã được tạo tự động.`,
      link: `/orders/${order._id}`,
      orderId: order._id,
      emailFn: () =>
        sendRefundApprovedEmail(buyer?.email, buyer?.fullName, order),
    });
  },

  /**
   * Seller confirmed returned item received → buyer needs to provide bank info for refund.
   * Buyer → realtime only.
   */
  async returnReceivedBankRequired({ io, order }) {
    const id = sid(order);
    return fire(io, order.buyerId, {
      type: "order",
      realtime: true,
      email: false,
      title: "Seller đã nhận hàng hoàn — cần cung cấp STK",
      message: `Đơn hàng #${id}: Người bán đã xác nhận nhận được hàng hoàn. Admin sẽ liên hệ hoặc bạn có thể cung cấp số tài khoản ngân hàng trong đơn hàng để nhận tiền hoàn.`,
      link: `/orders/${order._id}`,
      orderId: order._id,
    });
  },

  /**
   * Admin finalised the refund (money returned to buyer, deducted from seller).
   * Buyer  → realtime + email
   * Seller → realtime only
   */
  async refundCompleted({ io, order }) {
    const id = sid(order);
    const buyer = await Account.findById(order.buyerId).lean();
    return Promise.all([
      fire(io, order.buyerId, {
        type: "order",
        realtime: true,
        email: true,
        title: "Hoàn tiền đã hoàn tất",
        message: `Hoàn tiền cho đơn hàng #${id} đã được xử lý.`,
        link: `/orders/${order._id}`,
        orderId: order._id,
        emailFn: () =>
          sendRefundApprovedEmail(buyer?.email, buyer?.fullName, order),
      }),
      fire(io, order.sellerId, {
        type: "order",
        realtime: true,
        email: false,
        title: "Hoàn tiền đã được trừ khỏi ví",
        message: `Hoàn tiền cho đơn hàng #${id} đã được trừ khỏi ví của bạn.`,
        link: "/seller/wallet",
        orderId: order._id,
      }),
    ]);
  },

  /**
   * Seller payout released after order completes.
   * Seller → realtime + email.
   *
   * @param {object} opts
   * @param {import('socket.io').Server} opts.io
   * @param {object} opts.order
   * @param {number} opts.netAmount  - amount after platform fee
   */
  async payoutReleased({ io, order, netAmount }) {
    const id = sid(order);
    const seller = await Account.findById(order.sellerId)
      .select("email fullName")
      .lean();
    return fire(io, order.sellerId, {
      type: "order",
      realtime: true,
      email: true,
      title: "Doanh thu đã được giải ngân",
      message: `Đơn hàng #${id} hoàn tất. ${Number(netAmount).toLocaleString("vi-VN")}₫ đã vào ví của bạn.`,
      link: "/seller/wallet",
      orderId: order._id,
      emailFn: () =>
        sendPayoutReleasedEmail(
          seller?.email,
          seller?.fullName,
          order,
          netAmount,
        ),
    });
  },
};

module.exports = NotificationService;
