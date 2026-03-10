"use strict";

const mongoose = require("mongoose");
const Order    = require("../models/Order");
const Refund   = require("../models/Refund");
const BankInfo = require("../models/BankInfo");
const WalletService  = require("./wallet.service");
const PaymentService = require("./payment.service");
const {
  validateOrderStatusTransition,
  getStatusTimestampField,
} = require("../utils/orderStateMachine");

/**
 * RefundService
 *
 * Handles the full refund lifecycle:
 *   delivered → refund_requested → refund_approved → refunded
 *
 * COD:    platform deducts seller wallet and marks order paymentStatus = "refunded"
 * BANK_TRANSFER: seller refunds buyer manually;
 *                system records the event and adjusts wallet
 */
const RefundService = {

  /**
   * Buyer requests a refund after delivery.
   * Creates a Refund document and transitions order → refund_requested.
   */
  async requestRefund({
    orderId,
    buyerId,
    reason,
    description,
    refundAmount,
    evidence = { images: [], videos: [] },
    buyerBankName,
    buyerAccountNumber,
    buyerAccountHolder,
  }) {
    const order = await Order.findOne({ _id: orderId, buyerId });
    if (!order) {
      throw Object.assign(new Error("Đơn hàng không tồn tại"), { status: 404 });
    }

    validateOrderStatusTransition(order.status, "refund_requested");

    // Inspect window check: buyer can only request refund within 24h of delivery
    if (order.returnWindowExpiresAt && new Date() > order.returnWindowExpiresAt) {
      throw Object.assign(
        new Error("Đã hết thời hạn kiểm tra hàng (24 giờ sau khi giao). Không thể yêu cầu hoàn tiền."),
        { status: 400 },
      );
    }

    const requested = refundAmount ? Number(refundAmount) : order.totalAmount;
    if (isNaN(requested) || requested <= 0 || requested > order.totalAmount) {
      throw Object.assign(
        new Error(`Số tiền hoàn không hợp lệ. Tối đa: ${order.totalAmount}`),
        { status: 400 },
      );
    }

    const existing = await Refund.findOne({
      orderId,
      status: { $in: ["pending", "disputed"] },
    });
    if (existing) {
      throw Object.assign(
        new Error("Đơn hàng này đã có yêu cầu hoàn tiền đang xử lý"),
        { status: 409 },
      );
    }

    const now = new Date();
    const tsField = getStatusTimestampField("refund_requested");

    // Create Refund first — if validation fails, order status stays unchanged
    const refund = await Refund.create({
      orderId,
      buyerId,
      sellerId:     order.sellerId,
      reason,
      description,
      evidence,
      refundAmount: requested,
      status:       "pending",
    });

    await Order.findByIdAndUpdate(orderId, {
      $set:  { status: "refund_requested", refundReason: reason, refundRequestId: refund._id, [tsField]: now },
      $push: { statusHistory: { status: "refund_requested", updatedAt: now } },
    });

    // Save buyer bank info at request time (if provided)
    if (buyerBankName?.trim() && buyerAccountNumber?.trim() && buyerAccountHolder?.trim()) {
      await BankInfo.findOneAndUpdate(
        { orderId, type: "refund_account" },
        {
          $set: {
            buyerId,
            orderId,
            type:               "refund_account",
            buyerBankName:      buyerBankName.trim(),
            buyerAccountNumber: buyerAccountNumber.trim(),
            buyerAccountHolder: buyerAccountHolder.trim(),
            submittedAt:        now,
          },
        },
        { new: true, upsert: true },
      );
    }

    return refund;
  },

  /**
   * Seller approves or rejects a refund request.
   * On approval: transitions order → refund_approved.
   */
  async sellerRespondToRefund({ refundId, sellerId, decision, comment }) {
    if (!["approved", "rejected"].includes(decision)) {
      throw Object.assign(new Error("Decision phải là 'approved' hoặc 'rejected'"), { status: 400 });
    }

    const refund = await Refund.findOne({ _id: refundId, sellerId });
    if (!refund) throw Object.assign(new Error("Không tìm thấy yêu cầu hoàn tiền"), { status: 404 });
    if (refund.status !== "pending") {
      throw Object.assign(new Error("Yêu cầu này đã được xử lý"), { status: 400 });
    }

    refund.status = decision;
    refund.sellerResponse = { decision, comment: comment || "", respondedAt: new Date() };
    await refund.save();

    if (decision === "approved") {
      const now     = new Date();
      const tsField = getStatusTimestampField("refund_approved");
      await Order.findByIdAndUpdate(refund.orderId, {
        $set:  {
          status:          "refund_approved",
          refundRequestId: refund._id,
          [tsField]:       now,
        },
        $push: { statusHistory: { status: "refund_approved", updatedAt: now } },
      });
    }

    return refund;
  },

  /**
   * Buyer escalates to admin when seller rejects.
   */
  async escalateToAdmin({ refundId, buyerId }) {
    const refund = await Refund.findOne({ _id: refundId, buyerId });
    if (!refund) throw Object.assign(new Error("Không tìm thấy yêu cầu hoàn tiền"), { status: 404 });
    if (refund.status !== "rejected") {
      throw Object.assign(new Error("Chỉ có thể khiếu nại khi seller từ chối"), { status: 400 });
    }
    if (refund.escalatedToAdmin) {
      throw Object.assign(new Error("Yêu cầu này đã được chuyển lên admin"), { status: 409 });
    }

    refund.status           = "disputed";
    refund.escalatedToAdmin = true;
    refund.escalatedAt      = new Date();
    await refund.save();
    return refund;
  },

  /**
   * Admin resolves a disputed refund.
   */
  async adminHandleDispute({ refundId, adminId, decision, comment }) {
    if (!["refund", "reject"].includes(decision)) {
      throw Object.assign(new Error("Decision phải là 'refund' hoặc 'reject'"), { status: 400 });
    }

    const refund = await Refund.findById(refundId);
    if (!refund) throw Object.assign(new Error("Không tìm thấy yêu cầu hoàn tiền"), { status: 404 });
    if (refund.status !== "disputed") {
      throw Object.assign(new Error("Chỉ xử lý được dispute"), { status: 400 });
    }

    refund.status = decision === "refund" ? "approved" : "rejected";
    refund.adminIntervention = {
      decision, comment: comment || "", handledBy: adminId, handledAt: new Date(),
    };
    await refund.save();

    if (decision === "refund") {
      const now     = new Date();
      const tsField = getStatusTimestampField("refund_approved");
      await Order.findByIdAndUpdate(refund.orderId, {
        $set:  {
          status:          "refund_approved",
          refundRequestId: refund._id,
          [tsField]:       now,
        },
        $push: { statusHistory: { status: "refund_approved", updatedAt: now } },
      });
    }

    return refund;
  },

  /**
   * Complete the refund — called by seller (or admin) after money is sent.
   *
   * COD:
   *   - deducts seller wallet balance
   *   - marks order paymentStatus = "refunded"
   *
   * BANK_TRANSFER:
   *   - seller refunds buyer externally; system records the event &
   *     adjusts wallet to maintain ledger accuracy
   */
  async processRefund({ refundId, sellerId }) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const refund = await Refund.findOne({ _id: refundId, sellerId }).session(session);
      if (!refund) throw Object.assign(new Error("Không tìm thấy yêu cầu hoàn tiền"), { status: 404 });
      if (refund.status !== "approved") {
        throw Object.assign(new Error("Yêu cầu chưa được duyệt"), { status: 400 });
      }

      const order = await Order.findById(refund.orderId).session(session);
      if (!order) throw new Error("Đơn hàng không tồn tại");

      const now     = new Date();
      const tsField = getStatusTimestampField("refunded");

      // Deduct seller wallet (applies to both COD and bank_transfer)
      await WalletService.deductForRefund(
        {
          sellerId:  order.sellerId,
          orderId:   order._id,
          refundId:  refund._id,
          amount:    refund.refundAmount,
        },
        session,
      );

      // Update Refund document
      refund.status     = "completed";
      refund.refundedAt = now;
      await refund.save({ session });

      // Update Order
      await Order.findByIdAndUpdate(
        order._id,
        {
          $set:  {
            status:         "refunded",
            payoutStatus:   "paid",       // no payout owed after refund
            paymentStatus:  "refunded",
            refundRequestId: refund._id,
            [tsField]:       now,
          },
          $push: { statusHistory: { status: "refunded", updatedAt: now } },
        },
        { session },
      );

      await session.commitTransaction();
      return refund;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  },
};

module.exports = RefundService;
