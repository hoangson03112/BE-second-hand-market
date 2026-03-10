"use strict";

const Order              = require("../models/Order");
const SellerWallet       = require("../models/SellerWallet");
const WalletService      = require("./wallet.service");
const { getIO }          = require("./socket");
const NotificationService = require("./notification.service");

/**
 * PayoutService
 *
 * Handles seller payout after order completion, plus withdrawal requests.
 */
const PayoutService = {

  /**
   * Release payout to seller's available balance.
   * Should be called after order status transitions to "completed".
   *
   * COD:   money was held in pendingBalance since GHN confirmed delivery.
   *        Here we convert it to spendable balance (minus platform fee).
   *
   * BANK_TRANSFER: buyer already paid directly to seller; nothing to release
   *        via wallet for the product amount, but we still record the earnings.
   */
  async releasePayout(orderId, session) {
    const order = await Order.findById(orderId).session(session || null);
    if (!order) throw Object.assign(new Error("Đơn hàng không tồn tại"), { status: 404 });

    if (order.status !== "completed") {
      throw Object.assign(
        new Error(`Chỉ giải ngân cho đơn đã hoàn thành. Trạng thái hiện tại: "${order.status}"`),
        { status: 400 },
      );
    }

    if (order.payoutStatus === "paid") {
      // Idempotent — already processed
      return { alreadyPaid: true };
    }

    const result = await WalletService.releasePayout(
      {
        sellerId:    order.sellerId,
        orderId:     order._id,
        grossAmount: order.productAmount,
        platformFee: order.platformFee,
      },
      session,
    );

    await Order.findByIdAndUpdate(
      orderId,
      { $set: { payoutStatus: "paid", payoutAt: new Date() } },
      { session: session || undefined },
    );

    // Notify seller: realtime + email (fire-and-forget)
    const netAmount = result.netAmount ?? (order.productAmount - (order.platformFee || 0));
    setImmediate(() =>
      NotificationService.payoutReleased({ io: getIO(), order, netAmount }).catch(
        (e) => console.error("[releasePayout notify]", e.message),
      ),
    );

    return result;
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
   * Seller requests a withdrawal from their available balance.
   * Validation only — actual bank transfer is done offline by admin.
   */
  async requestWithdrawal({ sellerId, amount }) {
    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) {
      throw Object.assign(new Error("Số tiền rút không hợp lệ"), { status: 400 });
    }

    const wallet = await WalletService.getWallet(sellerId);
    if (!wallet) {
      throw Object.assign(new Error("Ví chưa được khởi tạo"), { status: 404 });
    }
    if (wallet.balance < amt) {
      throw Object.assign(
        new Error(`Số dư không đủ. Số dư hiện tại: ${wallet.balance}`),
        { status: 400 },
      );
    }

    return WalletService.recordWithdrawal({ sellerId, amount: amt });
  },

  /**
   * Get wallet summary + recent transactions for a seller.
   */
  async getSellerWalletSummary(sellerId, { page = 1, limit = 20 } = {}) {
    const [wallet, transactions] = await Promise.all([
      WalletService.getWallet(sellerId),
      WalletService.getTransactions(sellerId, { page, limit }),
    ]);
    return { wallet, transactions };
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
