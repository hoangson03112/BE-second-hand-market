"use strict";

const mongoose = require("mongoose");
const Order = require("../models/Order");
const Refund = require("../models/Refund");
const BankInfo = require("../models/BankInfo");
const PaymentService = require("./payment.service");
const {
  validateOrderStatusTransition,
  getStatusTimestampField
} = require("../utils/orderStateMachine");
const {
  validateRefundStatusTransition
} = require("../utils/refundStateMachine");

const SELLER_RESPONSE_SLA_HOURS = Math.max(
  1,
  Number(process.env.REFUND_SELLER_RESPONSE_SLA_HOURS || 48)
);
const REFUND_PROCESSING_SLA_HOURS = Math.max(
  1,
  Number(process.env.REFUND_PROCESSING_SLA_HOURS || 72)
);
const REFUND_ESCALATION_SLA_HOURS = Math.max(
  1,
  Number(process.env.REFUND_ESCALATION_SLA_HOURS || 48)
);

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}











const RefundService = {





  async requestRefund({
    orderId,
    buyerId,
    reason,
    description,
    refundAmount,
    evidence = { images: [], videos: [] },
    buyerBankName,
    buyerAccountNumber,
    buyerAccountHolder
  }) {
    const order = await Order.findOne({ _id: orderId, buyerId });
    if (!order) {
      throw Object.assign(new Error("Đơn hàng không tồn tại"), { status: 404 });
    }

    const shippingMethod = String(order.shippingMethod || "").toLowerCase();
    if (shippingMethod === "local_pickup") {
      throw Object.assign(
        new Error("Đơn giao dịch trực tiếp không hỗ trợ hoàn hàng trên hệ thống."),
        { status: 400 }
      );
    }

    validateOrderStatusTransition(order.status, "refund");


    if (order.returnWindowExpiresAt && new Date() > order.returnWindowExpiresAt) {
      throw Object.assign(
        new Error("Đã hết thời hạn kiểm tra hàng (24 giờ sau khi giao). Không thể yêu cầu hoàn tiền."),
        { status: 400 }
      );
    }

    const requested = refundAmount ? Number(refundAmount) : order.totalAmount;
    if (isNaN(requested) || requested <= 0 || requested > order.totalAmount) {
      throw Object.assign(
        new Error(`Số tiền hoàn không hợp lệ. Tối đa: ${order.totalAmount}`),
        { status: 400 }
      );
    }

    const existing = await Refund.findOne({
      orderId,
      status: { $in: ["pending", "disputed"] }
    });
    if (existing) {
      throw Object.assign(
        new Error("Đơn hàng này đã có yêu cầu hoàn tiền đang xử lý"),
        { status: 409 }
      );
    }

    const now = new Date();
    const tsField = getStatusTimestampField("refund");


    const refund = await Refund.create({
      orderId,
      buyerId,
      sellerId: order.sellerId,
      reason,
      description,
      evidence,
      refundAmount: requested,
      status: "pending",
      sellerResponseDeadlineAt: addHours(now, SELLER_RESPONSE_SLA_HOURS)
    });

    await Order.findByIdAndUpdate(orderId, {
      $set: {
        status: "refund",
        refundRequestId: refund._id,
        [tsField]: now
      },
      $push: { statusHistory: { status: "refund", updatedAt: now } }
    });


    if (buyerBankName?.trim() && buyerAccountNumber?.trim() && buyerAccountHolder?.trim()) {
      await BankInfo.findOneAndUpdate(
        { orderId, type: "refund_account" },
        {
          $set: {
            buyerId,
            orderId,
            type: "refund_account",
            buyerBankName: buyerBankName.trim(),
            buyerAccountNumber: buyerAccountNumber.trim(),
            buyerAccountHolder: buyerAccountHolder.trim(),
            submittedAt: now
          }
        },
        { new: true, upsert: true }
      );
    }

    return refund;
  },


  /**
   * Giao thất bại + người mua đã chuyển khoản trước = người bán đang giữ cả
   * hàng lẫn tiền. Người mua không có gì để bấm vì họ chưa từng yêu cầu hoàn
   * tiền, nên hệ thống mở hộ để bộ máy sẵn có chạy tiếp:
   *
   *   người bán xác nhận đã nhận và kiểm hàng
   *     → người mua gửi STK → người bán chuyển khoản
   *
   * Mở ở trạng thái "returning" chứ không phải "pending": chặng vận chuyển
   * ngược đã xong rồi (theo dõi trên chính đơn hàng), thứ còn thiếu đúng là
   * bước người bán xác nhận đã nhận.
   *
   * Trả về đơn hàng đã chuyển sang "refund", hoặc null nếu không cần mở.
   */
  async openRefundForFailedDelivery(order) {
    if (order.paymentStatus !== "paid") return null;

    const existing = await Refund.findOne({
      orderId: order._id,
      status: { $nin: ["completed", "cancelled", "rejected"] }
    });
    if (existing) return null;

    const now = new Date();
    const refund = await Refund.create({
      orderId: order._id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      reason: "delivery_failed",
      description:
      "Giao hàng không thành công, kiện hàng đã được chuyển về người bán. " +
      "Người mua đã thanh toán trước nên cần được hoàn lại tiền.",
      refundAmount: order.totalAmount,
      status: "returning"
    });

    validateOrderStatusTransition(order.status, "refund");
    const tsField = getStatusTimestampField("refund");

    return Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          status: "refund",
          refundRequestId: refund._id,
          [tsField]: now
        },
        $push: { statusHistory: { status: "refund", updatedAt: now } }
      },
      { new: true, runValidators: true }
    );
  },


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
      // Mở cửa sổ khiếu nại. Hết hạn mà người mua không khiếu nại thì
      // autoEscalateOverdueRefunds đóng yêu cầu và hoàn tất đơn hàng.
      refund.escalationDeadlineAt = addHours(new Date(), REFUND_ESCALATION_SLA_HOURS);
    }
    await refund.save();

    return refund;
  },






  async autoEscalateOverdueRefunds() {
    const now = new Date();


    const pendingOverdue = await Refund.find({
      status: "pending",
      sellerResponseDeadlineAt: { $lte: now },
      escalatedToAdmin: { $ne: true }
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

        // Lỗi phụ, cố ý bỏ qua để không chặn luồng chính.

      }
    }


    const processingUpdateResult = await Refund.updateMany(
      {
        status: "processing",
        processingDeadlineAt: { $lte: now },
        $or: [
        { escalatedToAdmin: { $ne: true } },
        { autoEscalationReason: { $ne: "REFUND_PROCESSING_TIMEOUT" } }]

      },
      {
        $set: {
          escalatedToAdmin: true,
          escalatedAt: now,
          autoEscalatedAt: now,
          autoEscalationReason: "REFUND_PROCESSING_TIMEOUT"
        }
      }
    );

    // Người bán từ chối, người mua hết hạn mà không khiếu nại: khép yêu cầu và
    // trả đơn hàng về đường bình thường. Thiếu bước này thì đơn nằm mãi ở
    // trạng thái "refund" và không bao giờ hoàn tất được.
    const expiredRejections = await Refund.find({
      status: "rejected",
      escalationDeadlineAt: { $lte: now }
    });

    let rejectionsClosed = 0;
    for (const refund of expiredRejections) {
      try {
        refund.escalationDeadlineAt = null;
        await refund.save();
        await this._closeOrderAfterRefundRejected(refund.orderId);
        rejectionsClosed += 1;
      } catch (err) {
        console.error(
          `[autoEscalateOverdueRefunds] không đóng được refund ${refund._id}: ${err.message}`
        );
      }
    }

    return {
      sellerTimeoutEscalated,
      processingTimeoutEscalated:
      typeof processingUpdateResult?.modifiedCount === "number" ?
      processingUpdateResult.modifiedCount :
      0,
      rejectionsClosed
    };
  },




  async escalateToAdmin({ refundId, buyerId }) {
    const refund = await Refund.findOne({ _id: refundId, buyerId });
    if (!refund) throw Object.assign(new Error("Không tìm thấy yêu cầu hoàn tiền"), { status: 404 });
    if (refund.status !== "rejected") {
      throw Object.assign(new Error("Chỉ có thể khiếu nại khi seller từ chối"), { status: 400 });
    }
    if (refund.escalatedToAdmin) {
      throw Object.assign(new Error("Yêu cầu này đã được chuyển lên admin"), { status: 409 });
    }

    validateRefundStatusTransition(refund.status, "disputed");
    refund.status = "disputed";
    refund.escalatedToAdmin = true;
    refund.escalatedAt = new Date();
    refund.escalationDeadlineAt = null;
    await refund.save();
    return refund;
  },




  async adminHandleDispute({ refundId, adminId, decision, comment }) {
    if (!["refund", "reject"].includes(decision)) {
      throw Object.assign(new Error("Decision phải là 'refund' hoặc 'reject'"), { status: 400 });
    }

    const refund = await Refund.findById(refundId);
    if (!refund) throw Object.assign(new Error("Không tìm thấy yêu cầu hoàn tiền"), { status: 404 });
    if (refund.status !== "disputed") {
      throw Object.assign(new Error("Chỉ xử lý được dispute"), { status: 400 });
    }

    // Tranh chấp nổ ra lúc người bán kiểm hàng thì kiện hàng đã nằm ở chỗ họ
    // rồi. Xử cho người mua thì đi thẳng tới khâu tiền ("returned"), đừng quay
    // lại "approved" vì bước sau của nó là gửi trả hàng — đã làm xong.
    const inspectionDispute = Boolean(refund.returnInspection?.inspectedAt);
    const targetStatus =
    decision === "reject" ?
    "rejected" :
    inspectionDispute ? "returned" : "approved";

    validateRefundStatusTransition(refund.status, targetStatus);
    refund.status = targetStatus;
    refund.escalationDeadlineAt = null;
    refund.adminIntervention = {
      decision, comment: comment || "", handledBy: adminId, handledAt: new Date()
    };
    await refund.save();

    // Admin đã phán quyết không hoàn tiền — đây là chung cuộc, người mua không
    // còn đường khiếu nại nữa. Đưa đơn ra khỏi "refund", nếu không nó kẹt ở đó
    // vĩnh viễn vì lối ra duy nhất còn lại là "refunded".
    if (targetStatus === "rejected") {
      await this._closeOrderAfterRefundRejected(refund.orderId);
    }

    return refund;
  },


  /**
   * Yêu cầu hoàn tiền kết thúc mà không có đồng nào chuyển đi: đơn hàng quay về
   * đường bình thường và được hoàn tất.
   */
  async _closeOrderAfterRefundRejected(orderId) {
    const order = await Order.findById(orderId);
    if (!order || order.status !== "refund") return null;

    const now = new Date();
    const tsField = getStatusTimestampField("completed");
    validateOrderStatusTransition(order.status, "completed");

    return Order.findByIdAndUpdate(
      orderId,
      {
        $set: { status: "completed", [tsField]: now },
        $push: { statusHistory: { status: "completed", updatedAt: now } }
      },
      { new: true, runValidators: true }
    );
  },





  async processRefund({ refundId, sellerId }) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const refund = await Refund.findOne({ _id: refundId, sellerId }).session(session);
      if (!refund) throw Object.assign(new Error("Không tìm thấy yêu cầu hoàn tiền"), { status: 404 });
      if (!["returned", "processing"].includes(refund.status)) {
        throw Object.assign(
          new Error(
            "Chỉ đánh dấu hoàn tiền xong khi đã nhận hàng hoàn và có thông tin chuyển khoản (trạng thái returned/processing)."
          ),
          { status: 400 }
        );
      }

      const order = await Order.findById(refund.orderId).session(session);
      if (!order) throw new Error("Đơn hàng không tồn tại");
      if (order.status !== "refund") {
        throw Object.assign(new Error("Đơn hàng không ở trạng thái hoàn tiền"), { status: 400 });
      }

      const now = new Date();
      const tsField = getStatusTimestampField("refunded");


      refund.status = "completed";
      refund.refundedAt = now;
      refund.processingDeadlineAt = null;
      refund.sellerResponseDeadlineAt = null;
      await refund.save({ session });


      await Order.findByIdAndUpdate(
        order._id,
        {
          $set: {
            status: "refunded",
            payoutStatus: "paid",
            paymentStatus: "refunded",
            refundRequestId: refund._id,
            [tsField]: now
          },
          $push: { statusHistory: { status: "refunded", updatedAt: now } }
        },
        { session }
      );

      await session.commitTransaction();
      return refund;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }
};

module.exports = RefundService;