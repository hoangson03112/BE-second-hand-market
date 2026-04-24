const Refund = require("../../models/Refund");
const Order = require("../../models/Order");
const Address = require("../../models/Address");
const BankInfo = require("../../models/BankInfo");
const RefundService = require("../../services/refund.service");
const GHNService = require("../../services/ghn.service");
const NotificationService = require("../../services/notification.service");
const { resolveFromAddress, isGhnShipping } = require("../../services/order.service");
const { MESSAGES } = require('../../utils/messages');
const {
  uploadMultipleToCloudinary,
  deleteMultipleFromCloudinary,
} = require("../../utils/CloudinaryUpload");
const { REFUND_SELLER_RESPONSE_SLA_HOURS = "48" } = process.env;

function getIO(req) {
  return req.app.get ? req.app.get("io") : null;
}
function notify(fn) {
  setImmediate(() => fn().catch((e) => console.error("[notify]", e.message)));
}

class RefundController {
  /**
   * Buyer tạo yêu cầu hoàn tiền
   * POST /api/v1/refunds
   */
  async createRefund(req, res) {
    try {
      const { orderId, reason, description, refundAmount } = req.body;
      const buyerId = req.accountID;

      // Validate
      if (!orderId || !reason || !description) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REFUND.MISSING_INFO,
        });
      }

      // KiỒm tra order
      const order = await Order.findOne({ _id: orderId, buyerId });
      if (!order) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.REFUND.ORDER_NOT_FOUND,
        });
      }

      // Only allow refund for delivered orders (not completed  completed skips refund window)
      if (order.status !== "delivered") {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REFUND.ONLY_DELIVERED,
        });
      }
      // Validate refundAmount
      const requestedAmount = refundAmount ? Number(refundAmount) : order.totalAmount;
      if (isNaN(requestedAmount) || requestedAmount <= 0 || requestedAmount > order.totalAmount) {
        return res.status(400).json({
          success: false,
          message: `S\u1ed1 ti\u1ec1n ho\u00e0n kh\u00f4ng h\u1ee3p l\u1ec7. T\u1ed1i \u0111a: ${order.totalAmount}`,
        });
      }
      // Ki\u1ec3m tra \u0111\u00e3 c\u00f3 refund request ch\u01b0a
      const existingRefund = await Refund.findOne({
        orderId,
        status: { $in: ["pending", "disputed"] },
      });
      if (existingRefund) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REFUND.ALREADY_PENDING,
        });
      }

      // Upload evidence (ảnh + video)
      let uploadedImages = [];
      let uploadedVideos = [];

      if (req.files?.images) {
        uploadedImages = await uploadMultipleToCloudinary(
          req.files.images,
          "refunds/images"
        );
      }

      if (req.files?.videos) {
        uploadedVideos = await uploadMultipleToCloudinary(
          req.files.videos,
          "refunds/videos"
        );
      }

      // Format file data
      const formatFileData = (fileData) => ({
        url: fileData.url,
        publicId: fileData.publicId,
        originalName: fileData.name,
        type: fileData.type,
        size: fileData.size,
        uploadedAt: new Date(),
      });

      // Tạo refund request
      const refund = await Refund.create({
        orderId,
        buyerId,
        sellerId: order.sellerId,
        reason,
        description,
        evidence: {
          images: uploadedImages.map(formatFileData),
          videos: uploadedVideos.map(formatFileData),
        },
        refundAmount: requestedAmount,
        status: "pending",
        sellerResponseDeadlineAt: new Date(
          Date.now() + Number(REFUND_SELLER_RESPONSE_SLA_HOURS) * 60 * 60 * 1000,
        ),
      });

      await refund.populate([
        { path: "buyerId", select: "fullName email phoneNumber" },
        { path: "sellerId", select: "fullName email phoneNumber" },
        { path: "orderId" },
      ]);

      res.status(201).json({
        success: true,
        message: MESSAGES.REFUND.REQUEST_SENT,
        refund,
      });
    } catch (error) {
      console.error("Error creating refund:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.REFUND.CREATE_ERROR,
      });
    }
  }

  /**
   * Lấy danh sách refund của buyer
   * GET /api/v1/refunds/buyer/my
   */
  async getMyRefunds(req, res) {
    try {
      await RefundService.autoEscalateOverdueRefunds();
      const buyerId = req.accountID;
      const { page = 1, limit = 10, status } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const filter = { buyerId };
      if (status) filter.status = status;

      const [refunds, total] = await Promise.all([
        Refund.find(filter)
          .populate("orderId", "orderNumber totalPrice items")
          .populate("sellerId", "fullName avatar")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Refund.countDocuments(filter),
      ]);

      res.json({
        success: true,
        refunds,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching buyer refunds:", error);
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }

  /**
   * Lấy danh sách refund mà seller cần xử lý
   * GET /api/v1/refunds/seller/pending
   */
  async getSellerRefunds(req, res) {
    try {
      await RefundService.autoEscalateOverdueRefunds();
      const sellerId = req.accountID;
      const { page = 1, limit = 10, status } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const filter = { sellerId };
      if (status) filter.status = status;

      const [refunds, total] = await Promise.all([
        Refund.find(filter)
          .populate("orderId", "orderNumber totalPrice items")
          .populate("buyerId", "fullName avatar phoneNumber")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Refund.countDocuments(filter),
      ]);

      res.json({
        success: true,
        refunds,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching seller refunds:", error);
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }

  /**
   * Seller ph\u1ea3n h\u1ed3i y\u00eau c\u1ea7u ho\u00e0n ti\u1ec1n (approve/reject)
   * PUT /api/v1/refunds/:refundId/respond
   */
  async respondToRefund(req, res) {
    try {
      const { refundId } = req.params;
      const { decision, comment } = req.body;
      const sellerId = req.accountID;

      if (!decision || !["approved", "rejected"].includes(decision)) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REFUND.DECISION_INVALID,
        });
      }

      const refund = await Refund.findOne({ _id: refundId, sellerId });
      if (!refund) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.REFUND.NOT_FOUND,
        });
      }

      if (refund.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REFUND.ALREADY_PROCESSED,
        });
      }

      // Cập nhật refund
      refund.status = decision === "approved" ? "approved" : "rejected";
      refund.sellerResponse = {
        decision,
        comment: comment || "",
        respondedAt: new Date(),
      };
      refund.sellerResponseDeadlineAt = null;

      await refund.save();

      // Order.status stays "refund" until refund is completed.

      await refund.populate([
        { path: "buyerId", select: "fullName email" },
        { path: "orderId" },
      ]);

      res.json({
        success: true,
        message:
          decision === "approved"
            ? "Đã chấp nhận hoàn tiền. Vui lòng xử lý hoàn tiền cho khách."
            : "\u0110\u00e3 t\u1eeb ch\u1ed1i y\u00eau c\u1ea7u ho\u00e0n ti\u1ec1n",
        refund,
      });
    } catch (error) {
      console.error("Error responding to refund:", error);
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }

  /**
   * Buyer escalate to admin (n\u1ebfu kh\u00f4ng \u0111\u1ed3ng \u00fd v\u1edbi seller)
   * POST /api/v1/refunds/:refundId/escalate
   */
  async escalateToAdmin(req, res) {
    try {
      const { refundId } = req.params;
      const buyerId = req.accountID;

      const refund = await Refund.findOne({ _id: refundId, buyerId });
      if (!refund) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.REFUND.NOT_FOUND,
        });
      }

      if (refund.status !== "rejected") {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REFUND.ONLY_APPEAL_ON_REJECTED,
        });
      }

      if (refund.escalatedToAdmin) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REFUND.ALREADY_ESCALATED,
        });
      }

      refund.status = "disputed";
      refund.escalatedToAdmin = true;
      refund.escalatedAt = new Date();
      await refund.save();

      res.json({
        success: true,
        message: MESSAGES.REFUND.APPEAL_SENT,
        refund,
      });
    } catch (error) {
      console.error("Error escalating refund:", error);
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }

  /**
   * Admin xử lý dispute
   * PUT /api/v1/refunds/:refundId/admin-handle
   */
  async adminHandleRefund(req, res) {
    try {
      const { refundId } = req.params;
      const { decision, comment } = req.body;
      const adminId = req.accountID;

      if (!decision || !["refund", "reject"].includes(decision)) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REFUND.ADMIN_DECISION_INVALID,
        });
      }

      const refund = await Refund.findById(refundId);
      if (!refund) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.REFUND.NOT_FOUND,
        });
      }

      if (refund.status !== "disputed") {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REFUND.ONLY_ADMIN_CAN_HANDLE_DISPUTE,
        });
      }

      refund.status = decision === "refund" ? "approved" : "rejected";
      refund.adminIntervention = {
        decision,
        comment: comment || "",
        handledBy: adminId,
        handledAt: new Date(),
      };

      await refund.save();

      // Cập nhật order nếu approved: tạo đơn GHN hoàn trả (buyer → seller) khi đơn dùng GHN
      if (decision === "refund") {
        const order = await Order.findById(refund.orderId).lean();
        if (order) {
          const needsGhn = isGhnShipping(order.shippingMethod);
          const sellerAddress = await resolveFromAddress(order);
          const buyerAddress = order.shippingAddress
            ? await Address.findById(order.shippingAddress).lean()
            : null;

          let ghnReturnOrderCode = null;
          let ghnReturnTrackingUrl = null;
          let ghnReturnOrderInfo = null;

          const existing = await Order.findById(order._id)
            .select("ghnReturnOrderCode ghnReturnTrackingUrl ghnReturnOrderInfo")
            .lean();
          if (existing?.ghnReturnOrderCode) {
            ghnReturnOrderCode = existing.ghnReturnOrderCode;
            ghnReturnTrackingUrl = existing.ghnReturnTrackingUrl || null;
            ghnReturnOrderInfo = existing.ghnReturnOrderInfo || null;
          } else if (needsGhn) {
            if (!sellerAddress?.from_district_id || !sellerAddress?.from_ward_code) {
              return res.status(400).json({
                success: false,
                message:
                  "Người bán chưa cấu đủ địa chỉ lấy hàng GHN — không thể tạo vận đơn hoàn trả.",
              });
            }
            if (!buyerAddress?.districtId || !buyerAddress?.wardCode) {
              return res.status(400).json({
                success: false,
                message:
                  "Địa chỉ người mua thiếu mã quận/phường GHN — không thể tạo vận đơn hoàn trả.",
              });
            }
            try {
              const returnShipment = await GHNService.createReturnShipment({
                orderId: String(order._id),
                buyerAddress,
                sellerAddress,
                weight: order.products?.reduce((sum, p) => sum + (p.weight || 500), 0) || 500,
              });
              ghnReturnOrderCode = returnShipment.ghnReturnOrderCode;
              ghnReturnTrackingUrl = returnShipment.ghnReturnTrackingUrl;
              ghnReturnOrderInfo = returnShipment.ghnReturnOrderInfo ?? null;
            } catch (ghnErr) {
              console.error("[adminHandleRefund] GHN return shipment failed:", ghnErr.message);
              return res.status(502).json({
                success: false,
                message:
                  ghnErr.message ||
                  "Không tạo được đơn hoàn GHN. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.",
              });
            }
          }

          const now = new Date();
          await Refund.findByIdAndUpdate(refund._id, { $set: { status: "return_shipping" } });
          await Order.findByIdAndUpdate(refund.orderId, {
            $set: {
              refundRequestId: refund._id,
              refundApprovedAt: now,
              returningAt: now,
              ...(ghnReturnOrderCode && { ghnReturnOrderCode }),
              ...(ghnReturnTrackingUrl && { ghnReturnTrackingUrl }),
              ...(ghnReturnOrderInfo && { ghnReturnOrderInfo }),
            },
            $push: { statusHistory: { status: "refund", updatedAt: now } },
          });

          notify(() =>
            NotificationService.refundApproved({
              io: getIO(req),
              order: { ...order, _id: order._id, buyerId: order.buyerId, sellerId: order.sellerId },
            })
          );
        }
      }

      res.json({
        success: true,
        message:
          decision === "refund"
            ? "Admin đã chấp nhận hoàn tiền. Đã tạo đơn GHN hoàn trả — buyer gửi hàng về seller, seller xác nhận nhận hàng thì admin xử lý hoàn tiền."
            : "Admin đã từ chối yêu cầu",
        refund,
      });
    } catch (error) {
      console.error("Error admin handling refund:", error);
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }

  /**
   * \u0110\u00e1nh d\u1ea5u \u0111\u00e3 ho\u00e0n ti\u1ec1n xong
   * PUT /api/v1/refunds/:refundId/complete
   */
  async completeRefund(req, res) {
    try {
      const { refundId } = req.params;
      const sellerId = req.accountID;

      // Delegates to RefundService.processRefund which handles:
      // - refund.status = "completed"
      // - order.status = "refunded", payoutStatus = "paid"
      // All in a single Mongoose transaction.
      // Note: RefundService.processRefund will set order.status -> "refunded"
      const refund = await RefundService.processRefund({ refundId, sellerId });

      res.json({
        success: true,
        message: MESSAGES.REFUND.PROCESSED_SUCCESS,
        refund,
      });
    } catch (error) {
      console.error("Error completing refund:", error);
      const status = error.status || 500;
      res.status(status).json({ success: false, message: error.message || "Server error" });
    }
  }

  /**  /**
   * Chi tiết 1 refund
   * GET /api/v1/refunds/:refundId
   */
  async getRefundById(req, res) {
    try {
      const { refundId } = req.params;
      const userId = req.accountID;
      const isAdmin = req.accountRole === "admin";

      const query = Refund.findById(refundId)
        .populate("buyerId", "fullName email phoneNumber avatar")
        .populate("sellerId", "fullName email phoneNumber avatar")
        .populate(isAdmin
          ? {
              path: "orderId",
              populate: [
                { path: "products.productId", select: "name slug avatar price" },
                { path: "shippingAddress" },
              ],
            }
          : "orderId"
        );
      const refund = await query.lean();

      if (!refund) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.REFUND.NOT_FOUND,
        });
      }

      const orderIdForBank = refund.orderId?._id ?? refund.orderId;
      if (orderIdForBank) {
        const bank = await BankInfo.findOne({
          orderId: orderIdForBank,
          type: "refund_account",
        })
          .select("buyerBankName buyerAccountNumber buyerAccountHolder submittedAt")
          .lean();
        refund.buyerRefundBankInfo = bank || null;
      }

      // Check quyền xem
      const isBuyer = refund.buyerId?._id?.toString() === userId.toString();
      const isSeller = refund.sellerId?._id?.toString() === userId.toString();

      if (!isBuyer && !isSeller && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: MESSAGES.REFUND.UNAUTHORIZED,
        });
      }

      res.json({
        success: true,
        refund,
      });
    } catch (error) {
      console.error("Error fetching refund:", error);
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }

  /**
   * Admin: L\u1ea5y t\u1ea5t c\u1ea3 refunds (bao g\u1ed3m disputed)
   * GET /api/v1/refunds/admin/all
   */
  async getAllRefundsAdmin(req, res) {
    try {
      await RefundService.autoEscalateOverdueRefunds();
      const { page = 1, limit = 20, status, startDate, endDate } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const filter = {};
      if (status) filter.status = status;
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = end;
        }
      }

      const [refunds, total] = await Promise.all([
        Refund.find(filter)
          .populate("buyerId", "fullName email phoneNumber")
          .populate("sellerId", "fullName email phoneNumber")
          .populate("orderId", "orderNumber totalPrice")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Refund.countDocuments(filter),
      ]);

      res.json({
        success: true,
        refunds,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching all refunds:", error);
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }
}

module.exports = new RefundController();

