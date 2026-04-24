"use strict";

const Order              = require("../models/Order");
const { getIO }          = require("./socket");
const NotificationService = require("./notification.service");

/**
 * PayoutService
 *
 * Handles manual bank payout after order completion.
 */
const PayoutService = {

  /**
   * Admin marks a completed order as paid out (bank transfer handled offline).
   * Should be called after order status transitions to "completed".
   */
  async releasePayout(orderId, session) {
    const order = await Order.findById(orderId).session(session || null);
    if (!order) throw Object.assign(new Error("Đơn hàng không tồn tại"), { status: 404 });

    if (order.status !== "completed") {
      throw Object.assign(
        new Error(`Chỉ thanh toán cho đơn đã hoàn thành. Trạng thái hiện tại: "${order.status}"`),
        { status: 400 },
      );
    }

    if (order.payoutStatus === "paid") {
      // Idempotent — already processed
      return { alreadyPaid: true };
    }

    await Order.findByIdAndUpdate(
      orderId,
      { $set: { payoutStatus: "paid", payoutAt: new Date() } },
      { session: session || undefined },
    );

    // Notify seller: payout marked as paid by admin.
    const netAmount = Number(order.productAmount || 0) - Number(order.platformFee || 0);
    setImmediate(() =>
      NotificationService.payoutReleased({ io: getIO(), order, netAmount }).catch(
        (e) => console.error("[releasePayout notify]", e.message),
      ),
    );

    return {
      alreadyPaid: false,
      payoutStatus: "paid",
      netAmount,
    };
  },

  /**
   * Admin view: list orders that are "completed" but payout not yet released.
   */
  async getPendingPayouts() {
    return Order.find({ status: "completed", payoutStatus: "pending" })
      .select("sellerId buyerId productAmount platformFee totalAmount paymentMethod completedAt")
      .sort({ completedAt: 1 })
      .lean();
  },

  /**
   * List a seller's completed orders with their payout status.
   */
  async getSellerPayoutOrders(sellerId, { page = 1, limit = 20, payoutStatus } = {}) {
    const filter = { sellerId, status: "completed" };
    if (payoutStatus) filter.payoutStatus = payoutStatus;

    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select("buyerId productAmount platformFee totalAmount paymentMethod payoutStatus payoutAt completedAt ghnOrderCode")
        .populate("buyerId", "fullName email")
        .lean(),
      Order.countDocuments(filter),
    ]);
    return { orders, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) };
  },
};

module.exports = PayoutService;
