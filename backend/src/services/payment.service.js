"use strict";

const mongoose = require("mongoose");
const Order = require("../models/Order");
const WalletService = require("./wallet.service");

/**
 * PaymentService
 *
 * Handles all events that change paymentStatus on an order
 * and trigger wallet credits.
 */
const PaymentService = {

  /**
   * Called by GHN webhook when delivery is confirmed for a COD order.
   * Marks paymentStatus = "paid" and credits seller pendingBalance.
   */
  async confirmCODPayment(orderId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw new Error(`Order ${orderId} not found`);
      if (order.paymentMethod !== "cod") {
        throw new Error("confirmCODPayment called on non-COD order");
      }
      if (order.paymentStatus === "paid") {
        await session.abortTransaction();
        return order; // idempotent
      }

      await WalletService.ensureWallet(order.sellerId, session);

      order.paymentStatus = "paid";
      await order.save({ session });

      await WalletService.recordCODIncome(
        {
          sellerId: order.sellerId,
          orderId:  order._id,
          amount:   order.productAmount,
        },
        session,
      );

      await session.commitTransaction();
      return order;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  },

  /**
   * Called by admin when bank transfer from buyer has been verified.
   * Marks paymentStatus = "paid" and credits seller pendingBalance.
   */
  async confirmBankTransferPayment(orderId, adminId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw new Error(`Order ${orderId} not found`);
      if (order.paymentMethod !== "bank_transfer") {
        throw new Error("confirmBankTransferPayment called on non-bank-transfer order");
      }
      if (order.paymentStatus === "paid") {
        await session.abortTransaction();
        return order;
      }

      await WalletService.ensureWallet(order.sellerId, session);

      order.paymentStatus = "paid";
      order.paymentVerifiedAt = new Date();
      order.paymentVerifiedBy = adminId;
      await order.save({ session });

      await WalletService.recordBankTransferIncome(
        {
          sellerId: order.sellerId,
          orderId:  order._id,
          amount:   order.productAmount,
        },
        session,
      );

      await session.commitTransaction();
      return order;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  },

  /**
   * Mark an order's paymentStatus as "refunded".
   * Actual wallet deduction is handled by RefundService.
   */
  async markPaymentRefunded(orderId, session) {
    const update = { $set: { paymentStatus: "refunded" } };
    return Order.findByIdAndUpdate(orderId, update, { session, new: true });
  },
};

module.exports = PaymentService;
