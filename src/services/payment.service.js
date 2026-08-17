"use strict";

const mongoose = require("mongoose");
const Order = require("../models/Order");







const PaymentService = {





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
        return order;
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





  async markPaymentRefunded(orderId, session) {
    const update = { $set: { paymentStatus: "refunded" } };
    return Order.findByIdAndUpdate(orderId, update, { session, new: true });
  }
};

module.exports = PaymentService;