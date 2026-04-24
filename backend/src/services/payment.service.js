"use strict";

const mongoose = require("mongoose");
const Order = require("../models/Order");

/**
 * PaymentService
 *
 * Handles all events that change paymentStatus on an order
 * before admin performs manual payout transfer.
 */
const PaymentService = {

  /**
   * Called by GHN webhook when delivery is confirmed for a COD order.
   * Marks paymentStatus = "paid".
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

      order.paymentStatus = "paid";
      await order.save({ session });

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
   * Marks paymentStatus = "paid".
   * Money is settled directly between buyer and seller, so no wallet credit.
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

      order.paymentStatus = "paid";
      order.paymentVerifiedAt = new Date();
      order.paymentVerifiedBy = adminId;
      await order.save({ session });

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
