"use strict";

const mongoose = require("mongoose");
const Order    = require("../models/Order");
const Refund   = require("../models/Refund");
const BankInfo = require("../models/BankInfo");
const PaymentService = require("./payment.service");
const {
  validateOrderStatusTransition,
  getStatusTimestampField,
} = require("../utils/orderStateMachine");
const {
  validateRefundStatusTransition,
} = require("../utils/refundStateMachine");

const SELLER_RESPONSE_SLA_HOURS = Math.max(
  1,
  Number(process.env.REFUND_SELLER_RESPONSE_SLA_HOURS || 48),
);
const REFUND_PROCESSING_SLA_HOURS = Math.max(
  1,
  Number(process.env.REFUND_PROCESSING_SLA_HOURS || 72),
);

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/**
 * RefundService
 *
 * Handles the full refund lifecycle:
 *   delivered → (order.status = "refund") → refund completed → (order.status = "refunded")
 *
 * COD:    platform deducts seller wallet and marks order paymentStatus = "refunded"
 * BANK_TRANSFER: seller refunds buyer manually;
 *                system records the event and adjusts wallet
 */
const RefundService = {

  /**
   * Buyer requests a refund after delivery.
   * Creates a Refund document and transitions order → refund.
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

    const shippingMethod = String(order.shippingMethod || "").toLowerCase();
    if (shippingMethod === "local_pickup") {
      throw Object.assign(
        new Error("Đơn giao dịch trực tiếp không hỗ trợ hoàn hàng trên hệ thống."),
        { status: 400 },
      );
    }

    validateOrderStatusTransition(order.status, "refund");

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
    const tsField = getStatusTimestampField("refund");

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
      sellerResponseDeadlineAt: addHours(now, SELLER_RESPONSE_SLA_HOURS),
    });

    await Order.findByIdAndUpdate(orderId, {
      $set:  {
        status: "refund",
        refundRequestId: refund._id,
        [tsField]: now,
      },
      $push: { statusHistory: { status: "refund", updatedAt: now } },
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
   * Note: order.status stays "refund" until the refund is completed.
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

    validateRefundStatusTransition(refund.status, decision);
    refund.status = decision;
    refund.sellerResponse = { decision, comment: comment || "", respondedAt: new Date() };
    refund.sellerResponseDeadlineAt = null;
    if (decision === "rejected") {
      refund.processingDeadlineAt = null;
    }
    await refund.save();

    return refund;
  },

  /**
   * System SLA sweep:
   * - pending quá hạn phản hồi seller -> disputed + escalatedToAdmin
   * - processing quá hạn xử lý hoàn tiền -> escalatedToAdmin (giữ status processing)
   */
  async autoEscalateOverdueRefunds() {
    const now = new Date();

    // 1) Seller didn't respond in time
    const pendingOverdue = await Refund.find({
      status: "pending",
      sellerResponseDeadlineAt: { $lte: now },
      escalatedToAdmin: { $ne: true },
    });

    let sellerTimeoutEscalated = 0;
    for (const refund of pendingOverdue) {
      try {
        validateRefundStatusTransition(refund.status, "disputed");
        refund.status = "disputed";
        refund.escalatedToAdmin = true;
        refund.escalatedAt = now;
        refund.autoEscalatedAt = now;
        refund.autoEscalationReason = "SELLER_RESPONSE_TIMEOUT";
        refund.sellerResponseDeadlineAt = null;
        await refund.save();
        sellerTimeoutEscalated += 1;
      } catch {
        // ignore invalid transition edge cases
      }
    }

    // 2) Processing takes too long (admin follow-up needed)
    const processingUpdateResult = await Refund.updateMany(
      {
        status: "processing",
        processingDeadlineAt: { $lte: now },
        $or: [
          { escalatedToAdmin: { $ne: true } },
          { autoEscalationReason: { $ne: "REFUND_PROCESSING_TIMEOUT" } },
        ],
      },
      {
        $set: {
          escalatedToAdmin: true,
          escalatedAt: now,
          autoEscalatedAt: now,
          autoEscalationReason: "REFUND_PROCESSING_TIMEOUT",
        },
      },
    );

    return {
      sellerTimeoutEscalated,
      processingTimeoutEscalated:
        typeof processingUpdateResult?.modifiedCount === "number"
          ? processingUpdateResult.modifiedCount
          : 0,
    };
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

    const targetStatus = decision === "refund" ? "approved" : "rejected";
    validateRefundStatusTransition(refund.status, targetStatus);
    refund.status = targetStatus;
    refund.adminIntervention = {
      decision, comment: comment || "", handledBy: adminId, handledAt: new Date(),
    };
    await refund.save();

    return refund;
  },

  /**
   * Complete the refund — called by seller (or admin) after money is sent.
   * Marks order/refund as completed in system after off-platform transfer.
   */
  async processRefund({ refundId, sellerId }) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const refund = await Refund.findOne({ _id: refundId, sellerId }).session(session);
      if (!refund) throw Object.assign(new Error("Không tìm thấy yêu cầu hoàn tiền"), { status: 404 });
      if (!["returned", "processing"].includes(refund.status)) {
        throw Object.assign(
          new Error(
            "Chỉ đánh dấu hoàn tiền xong khi đã nhận hàng hoàn và có thông tin chuyển khoản (trạng thái returned/processing).",
          ),
          { status: 400 },
        );
      }

      const order = await Order.findById(refund.orderId).session(session);
      if (!order) throw new Error("Đơn hàng không tồn tại");
      if (order.status !== "refund") {
        throw Object.assign(new Error("Đơn hàng không ở trạng thái hoàn tiền"), { status: 400 });
      }

      const now     = new Date();
      const tsField = getStatusTimestampField("refunded");

      // Update Refund document
      refund.status     = "completed";
      refund.refundedAt = now;
      refund.processingDeadlineAt = null;
      refund.sellerResponseDeadlineAt = null;
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
