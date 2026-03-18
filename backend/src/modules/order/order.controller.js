"use strict";

/**
 * OrderController - thin HTTP layer.
 *
 * Each method:
 *   1. Reads HTTP inputs.
 *   2. Delegates ALL business logic to a service.
 *   3. Fires notifications (best-effort, non-blocking via setImmediate).
 *   4. Returns a JSON response.
 *
 * No try/catch needed - asyncHandler in the router forwards thrown errors
 * to the global errorHandler, which reads err.status for the HTTP code.
 */

const Order = require("../../models/Order");
const Refund = require("../../models/Refund");
const Seller = require("../../models/Seller");
const Account = require("../../models/Account");
const Address = require("../../models/Address");
const BankInfo = require("../../models/BankInfo");
const OrderService = require("../../services/order.service");
const { resolveFromAddress } = require("../../services/order.service");
const GHNService = require("../../services/ghn.service");
const PaymentService = require("../../services/payment.service");
const RefundService = require("../../services/refund.service");
const PayoutService = require("../../services/payout.service");
const NotificationService = require("../../services/notification.service");
const { logAdminAction } = require("../../services/adminAuditLog.service");
const { MESSAGES } = require("../../utils/messages");
const { uploadMultipleToCloudinary } = require("../../utils/CloudinaryUpload");
const {
  validateOrderStatusTransition,
} = require("../../utils/orderStateMachine");
const { REFUND_PROCESSING_SLA_HOURS = "72" } = process.env;

// --- Helpers ------------------------------------------------------------------

function getIO(req) {
  return req.app.get("io");
}

/** Fire-and-forget — wraps a NotificationService call so it never throws */
function notify(fn) {
  setImmediate(() => fn().catch((e) => console.error("[notify]", e.message)));
}

/** Throw 403 unless requester is buyer, seller, or admin. */
async function assertOwnerOrAdmin(req, order) {
  const rid = String(req.accountID);
  const buyerId = String(order.buyerId?._id || order.buyerId || "");
  const sellerId = String(order.sellerId?._id || order.sellerId || "");
  if (rid === buyerId || rid === sellerId) return;
  const acct = await Account.findById(req.accountID).select("role").lean();
  if (acct?.role !== "admin")
    throw Object.assign(new Error("Forbidden"), { status: 403 });
}

// --- GHN Webhook Status Map ----------------------------------------------------

const GHN_STATUS_MAP = {
  ready_to_pick: "confirmed",
  picking: "confirmed",
  picked: "picked_up",
  storing: "picked_up",
  delivering: "out_for_delivery",
  delivered: "delivered",
  delivery_fail: "delivery_failed",
  waiting_to_return: "returning",
  return: "returning",
  returned: "returned",
  cancel: "cancelled",
};

// --- Controller --------------------------------------------------------------

class OrderController {
  // -- Buyer: place an order -------------------------------------------------
  async createOrder(req, res) {
    const order = await OrderService.createOrder({
      buyerId: req.accountID,
      sellerId: req.body.sellerId,
      products: req.body.products,
      totalAmount: req.body.totalAmount,
      shippingAddress: req.body.shippingAddress,
      shippingMethod: req.body.shippingMethod,
      paymentMethod: req.body.paymentMethod,
      productAmount: req.body.productAmount,
      shippingFee: req.body.shippingFee,
      totalShippingFee: req.body.totalShippingFee,
      expectedDeliveryTime: req.body.expectedDeliveryTime,
      note: req.body.note,
      voucherCode: req.body.voucherCode,
    });

    notify(() => NotificationService.orderCreated({ io: getIO(req), order }));

    return res.status(201).json({ success: true, order });
  }

  // -- Buyer: list own orders ------------------------------------------------
  async getMyOrders(req, res) {
    const { page = 1, limit = 10, status } = req.query;
    const result = await OrderService.getOrdersByBuyer(req.accountID, {
      page: Number(page),
      limit: Number(limit),
      status,
    });
    return res.json({ success: true, ...result });
  }

  // -- Seller: list own orders -----------------------------------------------
  async getSellerOrders(req, res) {
    const { page = 1, limit = 50, status } = req.query;
    // Order.sellerId references Account, so query directly by accountID
    const result = await OrderService.getOrdersBySeller(req.accountID, {
      page: Number(page),
      limit: Number(limit),
      status,
    });
    return res.json({ success: true, ...result });
  }

  // -- Admin: list all orders ------------------------------------------------
  async getAdminOrders(req, res) {
    const { page = 1, limit = 20, status, search } = req.query;
    const result = await OrderService.getAdminOrders({
      page: Number(page),
      limit: Number(limit),
      status,
      search,
    });
    return res.json({ success: true, ...result });
  }

  // -- Any: get one order ----------------------------------------------------
  async getOrderById(req, res) {
    const order = await OrderService.getOrderById(req.params.id);
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });
    await assertOwnerOrAdmin(req, order);
    return res.json({ success: true, order });
  }

  // -- Admin/Seller: update status via generic patch ------------------------
  async updateOrderStatus(req, res) {
    const { status, reason } = req.body;
    const updated = await OrderService.updateOrderStatus(
      req.params.id,
      status,
      reason,
    );

    if (status === "shipping") {
      notify(() =>
        NotificationService.orderShipped({ io: getIO(req), order: updated }),
      );
    } else {
      notify(() =>
        NotificationService.orderStatusChanged({
          io: getIO(req),
          order: updated,
          newStatus: status,
        }),
      );
    }

    if (status === "completed") {
      setImmediate(() =>
        PayoutService.releasePayout(String(updated._id)).catch((e) =>
          console.error("[releasePayout after complete]", e.message),
        ),
      );
    }

    return res.json({ success: true, data: updated });
  }

  // -- Buyer/Seller: cancel order --------------------------------------------
  async cancelOrder(req, res) {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id).lean();
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });

    const rid = String(req.accountID);
    const buyerId = String(order.buyerId);
    const sellerId = String(order.sellerId);

    const isBuyer = rid === buyerId;
    const isSeller = rid === sellerId;

    if (isBuyer) {
      if (order.status !== "pending") {
        throw Object.assign(new Error("Buyer can only cancel pending orders"), {
          status: 400,
        });
      }
    } else if (isSeller) {
      if (order.status !== "confirmed") {
        throw Object.assign(
          new Error("Seller can only cancel confirmed orders"),
          { status: 400 },
        );
      }
    } else {
      // Admin can cancel at any non-terminal status
      const acct = await Account.findById(req.accountID).select("role").lean();
      if (acct?.role !== "admin") {
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      }
    }

    const updated = await OrderService.updateOrderStatus(
      String(order._id),
      "cancelled",
      reason,
    );
    notify(() =>
      NotificationService.orderCancelled({ io: getIO(req), order, reason }),
    );

    return res.json({ success: true, data: updated });
  }

  // -- Seller: update to confirmed / cancelled / delivered -------------------
  async sellerUpdateOrder(req, res) {
    const ALLOWED = ["confirmed", "cancelled", "delivered"];
    const { status, reason } = req.body;
    if (!ALLOWED.includes(status)) {
      throw Object.assign(
        new Error(`Seller can only set status to: ${ALLOWED.join(", ")}`),
        { status: 400 },
      );
    }

    const order = await Order.findById(req.params.orderId).lean();
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });

    // Order.sellerId references Account - compare directly with accountID
    if (String(req.accountID) !== String(order.sellerId)) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }

    const updated = await OrderService.updateOrderStatus(
      String(order._id),
      status,
      reason,
    );
    notify(() =>
      NotificationService.orderStatusChanged({
        io: getIO(req),
        order: updated,
        newStatus: status,
      }),
    );

    return res.json({ success: true, data: updated });
  }

  // -- Admin: confirm bank transfer payment ----------------------------------
  async confirmBankTransfer(req, res) {
    const order = await PaymentService.confirmBankTransferPayment(
      req.params.id,
      req.accountID,
    );
    notify(() =>
      NotificationService.bankTransferConfirmed({ io: getIO(req), order }),
    );
    return res.json({ success: true, data: order });
  }

  // -- Admin/System: confirm COD payment ------------------------------------
  async confirmCodPayment(req, res) {
    const order = await PaymentService.confirmCODPayment(req.params.id);
    notify(() => NotificationService.codConfirmed({ io: getIO(req), order }));
    return res.json({ success: true, data: order });
  }

  // -- Buyer: confirm goods received (manual complete) -----------------------
  async buyerConfirmReceived(req, res) {
    const order = await Order.findById(req.params.id);
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });
    if (String(order.buyerId) !== String(req.accountID)) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    if (order.status !== "delivered") {
      throw Object.assign(
        new Error("Order must be delivered before confirming receipt"),
        {
          status: 400,
        },
      );
    }

    const updated = await OrderService.updateOrderStatus(
      String(order._id),
      "completed",
    );

    setImmediate(() =>
      PayoutService.releasePayout(String(order._id)).catch((e) =>
        console.error("[releasePayout buyerConfirm]", e.message),
      ),
    );
    notify(() => NotificationService.orderCompleted({ io: getIO(req), order }));

    return res.json({ success: true, data: updated });
  }

  // -- Buyer: request refund -------------------------------------------------
  async requestRefund(req, res) {
    const { reason, description } = req.body;

    // Upload evidence files to Cloudinary if provided
    let evidence = { images: [], videos: [] };
    if (req.files) {
      if (req.files.images?.length) {
        const uploaded = await uploadMultipleToCloudinary(
          req.files.images,
          "refunds/images",
        );
        evidence.images = uploaded.map((f) => ({
          url: f.url,
          publicId: f.publicId,
          originalName: f.name,
          type: f.type,
          size: f.size,
          uploadedAt: new Date(),
        }));
      }
      if (req.files.videos?.length) {
        const uploaded = await uploadMultipleToCloudinary(
          req.files.videos,
          "refunds/videos",
        );
        evidence.videos = uploaded.map((f) => ({
          url: f.url,
          publicId: f.publicId,
          originalName: f.name,
          type: f.type,
          size: f.size,
          uploadedAt: new Date(),
        }));
      }
    }

    const { bankName, accountNumber, accountHolder } = req.body;

    const refund = await RefundService.requestRefund({
      orderId:            req.params.id,
      buyerId:            req.accountID,
      reason,
      description,
      evidence,
      buyerBankName:      bankName,
      buyerAccountNumber: accountNumber,
      buyerAccountHolder: accountHolder,
    });

    const order = await Order.findById(req.params.id).lean();
    if (order)
      notify(() =>
        NotificationService.refundRequested({ io: getIO(req), order }),
      );

    return res.status(201).json({ success: true, data: refund });
  }

  // -- Seller: approve refund → create GHN return shipment → status "returning"
  async approveRefund(req, res) {
    const order = await Order.findById(req.params.id).lean();
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });

    // Only seller of this order can approve refund
    if (String(order.sellerId) !== String(req.accountID)) {
      throw Object.assign(new Error("Chỉ seller của đơn hàng mới được duyệt hoàn tiền"), {
        status: 403,
      });
    }

    if (order.status !== "refund") {
      throw Object.assign(
        new Error(`Không thể duyệt hoàn tiền khi đơn ở trạng thái "${order.status}"`),
        { status: 400 },
      );
    }
    if (!order.refundRequestId) {
      throw Object.assign(new Error("Đơn hàng chưa có yêu cầu hoàn tiền"), { status: 400 });
    }

    // 1. Mark refund as approved (order.status stays "refund")
    const refund = await RefundService.sellerRespondToRefund({
      refundId: String(order.refundRequestId),
      sellerId: req.accountID,
      decision: "approved",
      comment: req.body.note,
    });

    // 2. Resolve seller's pickup address and buyer's shipping address
    const sellerAddress = await resolveFromAddress(order);
    const buyerAddress  = order.shippingAddress
      ? await Address.findById(order.shippingAddress).lean()
      : null;

    // 3. Create GHN return shipment (buyer → seller)
    let ghnReturnOrderCode  = null;
    let ghnReturnTrackingUrl = null;
    if (sellerAddress && buyerAddress?.districtId && buyerAddress?.wardCode) {
      try {
        const returnShipment = await GHNService.createReturnShipment({
          orderId:       String(order._id),
          buyerAddress,
          sellerAddress,
          weight: order.products?.reduce((sum, p) => sum + (p.weight || 500), 0) || 500,
        });
        ghnReturnOrderCode  = returnShipment.ghnReturnOrderCode;
        ghnReturnTrackingUrl = returnShipment.ghnReturnTrackingUrl;
      } catch (ghnErr) {
        // Non-fatal: log and continue — seller can arrange shipping manually
        console.error("[approveRefund] GHN return shipment failed:", ghnErr.message);
      }
    }

    // 4. Update refund lifecycle: approved → return_shipping (order remains "refund")
    const now     = new Date();
    const refundDoc = await Refund.findById(order.refundRequestId);
    if (refundDoc) {
      const { validateRefundStatusTransition } = require("../../utils/refundStateMachine");
      validateRefundStatusTransition(refundDoc.status, "return_shipping");
      refundDoc.status = "return_shipping";
      await refundDoc.save();
    }

    await Order.findByIdAndUpdate(order._id, {
      $set: {
        refundApprovedAt: now,
        returningAt: now,
        ...(ghnReturnOrderCode  && { ghnReturnOrderCode }),
        ...(ghnReturnTrackingUrl && { ghnReturnTrackingUrl }),
      },
      $push: { statusHistory: { status: "refund", updatedAt: now } },
    });

    notify(() => NotificationService.refundApproved({ io: getIO(req), order }));

    return res.json({ success: true, data: { refund, ghnReturnOrderCode, ghnReturnTrackingUrl } });
  }

  // -- Seller: reject refund --------------------------------------------------
  async rejectRefund(req, res) {
    const order = await Order.findById(req.params.id).lean();
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });

    // Only seller of this order can reject refund
    if (String(order.sellerId) !== String(req.accountID)) {
      throw Object.assign(new Error("Chỉ seller của đơn hàng mới được từ chối hoàn tiền"), {
        status: 403,
      });
    }

    const refund = await RefundService.sellerRespondToRefund({
      refundId: String(order.refundRequestId),
      sellerId: req.accountID,
      decision: "rejected",
      comment: req.body.reason,
    });

    return res.json({ success: true, data: refund });
  }

  // -- Seller: confirm return item received → status "returned" ---------------
  async confirmReturnReceived(req, res) {
    const order = await Order.findById(req.params.id).lean();
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });

    const sellerId = String(order.sellerId?._id || order.sellerId || "");
    if (String(req.accountID) !== sellerId)
      throw Object.assign(new Error("Chỉ seller mới có thể xác nhận nhận hàng"), { status: 403 });

    if (order.status !== "refund")
      throw Object.assign(
        new Error(`Không thể xác nhận khi đơn hàng ở trạng thái "${order.status}"`),
        { status: 400 },
      );

    const now = new Date();
    if (order.refundRequestId) {
      await Refund.findByIdAndUpdate(order.refundRequestId, {
        $set: { status: "returned" },
      });
    }
    const updatedOrder = await Order.findByIdAndUpdate(
      order._id,
      {
        $set:  { returnedAt: now, sellerReceivedAt: now },
        $push: { statusHistory: { status: "refund", updatedAt: now } },
      },
      { new: true },
    ).lean();

    notify(() => NotificationService.returnReceivedBankRequired({ io: getIO(req), order }));

    return res.json({ success: true, data: updatedOrder });
  }

  // -- Buyer: submit bank info for refund transfer ---------------------------
  async submitRefundBankInfo(req, res) {
    const order = await Order.findById(req.params.id).lean();
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });

    if (String(order.buyerId) !== String(req.accountID))
      throw Object.assign(new Error("Chỉ người mua mới có thể cung cấp thông tin ngân hàng"), { status: 403 });

    if (order.status !== "refund")
      throw Object.assign(new Error("Đơn hàng không ở trạng thái hoàn tiền"), { status: 400 });
    if (!order.refundRequestId)
      throw Object.assign(new Error("Đơn hàng chưa có yêu cầu hoàn tiền"), { status: 400 });
    const refund = await Refund.findById(order.refundRequestId).lean();
    if (!refund || refund.status !== "returned") {
      throw Object.assign(
        new Error("Chỉ có thể cung cấp STK sau khi seller xác nhận đã nhận hàng hoàn"),
        { status: 400 },
      );
    }

    const { bankName, accountNumber, accountHolder } = req.body;
    if (!bankName?.trim() || !accountNumber?.trim() || !accountHolder?.trim())
      throw Object.assign(new Error("Vui lòng điền đầy đủ tên ngân hàng, số tài khoản và tên chủ tài khoản"), { status: 400 });

    const bankInfo = await BankInfo.findOneAndUpdate(
      { orderId: order._id, type: "refund_account" },
      {
        $set: {
          buyerId:            order.buyerId,
          orderId:            order._id,
          type:               "refund_account",
          buyerBankName:      bankName.trim(),
          buyerAccountNumber: accountNumber.trim(),
          buyerAccountHolder: accountHolder.trim(),
          submittedAt:        new Date(),
        },
      },
      { new: true, upsert: true },
    );

    // Mark refund lifecycle as ready for admin processing (bank info submitted)
    await Refund.findByIdAndUpdate(order.refundRequestId, {
      $set: {
        status: "processing",
        processingDeadlineAt: new Date(
          Date.now() + Number(REFUND_PROCESSING_SLA_HOURS) * 60 * 60 * 1000,
        ),
      },
    });

    return res.json({ success: true, data: bankInfo });
  }

  // -- Admin: finalize (process) refund with wallet deduction ----------------
  async completeRefund(req, res) {
    // Find the approved refund for this order so we have refundId + sellerId
    const order = await Order.findById(req.params.id).lean();
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });

    const refundDoc = await Refund.findOne({
      orderId: req.params.id,
      status: { $in: ["returned", "processing"] },
    }).lean();
    if (!refundDoc)
      throw Object.assign(
        new Error("No approved refund found for this order"),
        { status: 404 },
      );

    const refund = await RefundService.processRefund({
      refundId: String(refundDoc._id),
      sellerId: String(order.sellerId),
    });

    try {
      await logAdminAction({
        adminId: req.accountID,
        action: "REFUND_COMPLETED",
        targetType: "Refund",
        targetId: refundDoc._id,
        metadata: {
          orderId: order._id,
          sellerId: order.sellerId,
          buyerId: order.buyerId,
          refundAmount: refund?.refundAmount ?? refundDoc?.refundAmount ?? null,
        },
        req,
      });
    } catch (e) {
      console.error("Lỗi ghi audit log complete refund:", e.message);
    }

    notify(() =>
      NotificationService.refundCompleted({ io: getIO(req), order }),
    );

    return res.json({ success: true, data: refund });
  }

  // -- Admin: manually trigger payout ---------------------------------------
  async triggerPayout(req, res) {
    const order = await Order.findById(req.params.id).lean();
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });
    const result = await PayoutService.releasePayout(String(order._id));

    try {
      await logAdminAction({
        adminId: req.accountID,
        action: "PAYOUT_TRIGGERED",
        targetType: "Order",
        targetId: order._id,
        metadata: {
          sellerId: order.sellerId,
          buyerId: order.buyerId,
          totalAmount: order.totalAmount,
          payoutStatus: order.payoutStatus,
        },
        req,
      });
    } catch (e) {
      console.error("Lỗi ghi audit log trigger payout:", e.message);
    }

    return res.json({ success: true, data: result });
  }

  // -- Seller: payout history ------------------------------------------------
  async getSellerPayouts(req, res) {
    const { page = 1, limit = 10, payoutStatus } = req.query;
    const seller = await Seller.findOne({ accountId: req.accountID }).lean();
    if (!seller) return res.json({ success: true, data: [], total: 0 });
    const result = await PayoutService.getSellerPayoutOrders(seller._id, {
      page: Number(page),
      limit: Number(limit),
      payoutStatus,
    });
    return res.json({ success: true, ...result });
  }

  // -- Seller: wallet summary ------------------------------------------------
  async getSellerWallet(req, res) {
    const seller = await Seller.findOne({ accountId: req.accountID }).lean();
    if (!seller)
      throw Object.assign(new Error("Seller profile not found"), {
        status: 404,
      });
    const summary = await PayoutService.getSellerWalletSummary(seller._id);
    return res.json({ success: true, data: summary });
  }

  // -- Admin: list orders pending payout ------------------------------------
  async getAdminPendingPayouts(req, res) {
    const orders = await PayoutService.getPendingPayouts();
    return res.json({ success: true, data: orders });
  }

  // -- Seller: get own bank info ---------------------------------------------
  async getSellerBankInfo(req, res) {
    const { orderId } = req.params;

    const order = await Order.findById(orderId)
      .select("buyerId sellerId totalAmount")
      .lean();
    if (!order)
      throw Object.assign(new Error("Đơn hàng không tồn tại"), { status: 404 });

    // Only the buyer of the order may fetch seller bank details
    if (order.buyerId.toString() !== req.accountID.toString())
      throw Object.assign(new Error("Không có quyền truy cập"), { status: 403 });

    const seller = await Seller.findOne({ accountId: order.sellerId })
      .select("bankInfo businessName")
      .lean();
    if (!seller || !seller.bankInfo)
      throw Object.assign(new Error("Người bán chưa cài đặt thông tin ngân hàng"), { status: 404 });

    const shortId = orderId.toString().slice(-8).toUpperCase();

    return res.json({
      success: true,
      bankName: seller.bankInfo.bankName,
      accountNumber: seller.bankInfo.accountNumber,
      accountHolder: seller.bankInfo.accountHolder,
      bankBin: seller.bankInfo.bankBin || null,
      amount: order.totalAmount,
      content: `THANHTOAN ${shortId}`,
      orderId,
    });
  }

  // -- GHN: get tracking for an order ----------------------------------------
  async getOrderTracking(req, res) {
    const { id } = req.params;
    const order = await Order.findById(id)
      .select("ghnOrderCode buyer seller")
      .lean();
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: MESSAGES.ORDER.NOT_FOUND });
    }

    const userId = req.user?.id || req.user?._id;
    const isBuyer = order.buyer?.toString() === userId?.toString();
    const isSeller = order.seller?.toString() === userId?.toString();
    if (!isBuyer && !isSeller) {
      return res.status(403).json({
        success: false,
        message: MESSAGES.COMMON?.FORBIDDEN || "Không có quyền truy cập.",
      });
    }

    if (!order.ghnOrderCode) {
      return res.json({ success: true, tracking: null });
    }

    const tracking = await GHNService.getOrderTracking(order.ghnOrderCode);
    return res.json({ success: true, tracking });
  }

  // -- GHN: incoming webhook -------------------------------------------------
  async handleGHNWebhook(req, res) {
    const token = req.headers["token"];
    if (token !== process.env.GHN_WEBHOOK_TOKEN) {
      return res
        .status(401)
        .json({ success: false, message: MESSAGES.ORDER.INVALID_TOKEN });
    }

    const { OrderCode, Status } = req.body;
    if (!OrderCode || !Status) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.ORDER.MISSING_ORDER_CODE_OR_STATUS,
      });
    }

    const newStatus = GHN_STATUS_MAP[Status.toLowerCase()];
    if (!newStatus) {
      // Unknown GHN status - acknowledge without action
      return res.json({
        success: true,
        message: MESSAGES.ORDER.STATUS_NOT_MAPPED,
      });
    }

    // Normal shipment webhook
    let order = await Order.findOne({ ghnOrderCode: OrderCode });
    // Return shipment webhook (buyer -> seller) should update Refund lifecycle
    if (!order) {
      order = await Order.findOne({ ghnReturnOrderCode: OrderCode });
      if (order) {
        // Map GHN return statuses to Refund.status, keep order.status as "refund"
        if (order.refundRequestId) {
          const lower = String(Status).toLowerCase();
          let refundStatus = null;
          if (["waiting_to_return", "return"].includes(lower)) refundStatus = "returning";
          if (lower === "returned") refundStatus = "returned";
          if (["delivery_fail", "cancel"].includes(lower)) refundStatus = "failed";
          if (refundStatus) {
            const { validateRefundStatusTransition } = require("../../utils/refundStateMachine");
            const refundDoc = await Refund.findById(order.refundRequestId);
            if (refundDoc) {
              validateRefundStatusTransition(refundDoc.status, refundStatus);
              refundDoc.status = refundStatus;
              await refundDoc.save();
            }
          }
        }
        return res.json({ success: true, message: "Return shipment status recorded" });
      }
    }
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: MESSAGES.ORDER.NOT_FOUND });
    }

    // Validate the transition - skip if already in target state or invalid
    try {
      validateOrderStatusTransition(order.status, newStatus);
    } catch {
      return res.json({
        success: true,
        message: MESSAGES.ORDER.TRANSITION_SKIPPED,
      });
    }

    const updated = await OrderService.updateOrderStatus(
      String(order._id),
      newStatus,
    );

    // Side-effects based on resulting status
    if (newStatus === "completed") {
      setImmediate(() =>
        PayoutService.releasePayout(String(order._id)).catch((e) =>
          console.error("[GHN webhook releasePayout]", e.message),
        ),
      );
    }

    if (newStatus === "shipping") {
      notify(() =>
        NotificationService.orderShipped({ io: getIO(req), order: updated }),
      );
    } else {
      notify(() =>
        NotificationService.orderStatusChanged({
          io: getIO(req),
          order: updated,
          newStatus,
        }),
      );
    }

    return res.json({ success: true, data: updated });
  }
}

module.exports = new OrderController();
