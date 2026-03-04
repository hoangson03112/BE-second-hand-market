const Refund = require("../models/Refund");
const Order = require("../models/Order");
const {
  uploadMultipleToCloudinary,
  deleteMultipleFromCloudinary,
} = require("../utils/CloudinaryUpload");

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
          message: "Thiếu thông tin bắt buộc",
        });
      }

      // Kiểm tra order
      const order = await Order.findOne({ _id: orderId, buyerId });
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy đơn hàng",
        });
      }

      // Chỉ cho phép refund nếu order đã completed
      if (order.status !== "completed") {
        return res.status(400).json({
          success: false,
          message: "Chỉ có thể yêu cầu hoàn tiền cho đơn hàng đã hoàn thành",
        });
      }

      // Kiểm tra đã có refund request chưa
      const existingRefund = await Refund.findOne({
        orderId,
        status: { $in: ["pending", "disputed"] },
      });
      if (existingRefund) {
        return res.status(400).json({
          success: false,
          message: "Đơn hàng này đã có yêu cầu hoàn tiền đang xử lý",
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
        refundAmount: refundAmount || order.totalPrice,
        status: "pending",
      });

      await refund.populate([
        { path: "buyerId", select: "fullName email phoneNumber" },
        { path: "sellerId", select: "fullName email phoneNumber" },
        { path: "orderId" },
      ]);

      res.status(201).json({
        success: true,
        message: "Đã gửi yêu cầu hoàn tiền. Seller sẽ xem xét trong 48h.",
        refund,
      });
    } catch (error) {
      console.error("Error creating refund:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi server khi tạo yêu cầu hoàn tiền",
      });
    }
  }

  /**
   * Lấy danh sách refund của buyer
   * GET /api/v1/refunds/buyer/my
   */
  async getMyRefunds(req, res) {
    try {
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
      res.status(500).json({ success: false, message: "Lỗi server" });
    }
  }

  /**
   * Lấy danh sách refund mà seller cần xử lý
   * GET /api/v1/refunds/seller/pending
   */
  async getSellerRefunds(req, res) {
    try {
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
      res.status(500).json({ success: false, message: "Lỗi server" });
    }
  }

  /**
   * Seller phản hồi yêu cầu hoàn tiền (approve/reject)
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
          message: "Decision phải là 'approved' hoặc 'rejected'",
        });
      }

      const refund = await Refund.findOne({ _id: refundId, sellerId });
      if (!refund) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy yêu cầu hoàn tiền",
        });
      }

      if (refund.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: "Yêu cầu này đã được xử lý",
        });
      }

      // Cập nhật refund
      refund.status = decision === "approved" ? "approved" : "rejected";
      refund.sellerResponse = {
        decision,
        comment: comment || "",
        respondedAt: new Date(),
      };

      await refund.save();

      // Nếu approved, cập nhật order status
      if (decision === "approved") {
        await Order.findByIdAndUpdate(refund.orderId, {
          status: "refund_approved",
          refundRequestId: refund._id,
        });
      }

      await refund.populate([
        { path: "buyerId", select: "fullName email" },
        { path: "orderId" },
      ]);

      res.json({
        success: true,
        message:
          decision === "approved"
            ? "Đã chấp nhận hoàn tiền. Vui lòng xử lý hoàn tiền cho khách."
            : "Đã từ chối yêu cầu hoàn tiền",
        refund,
      });
    } catch (error) {
      console.error("Error responding to refund:", error);
      res.status(500).json({ success: false, message: "Lỗi server" });
    }
  }

  /**
   * Buyer escalate to admin (nếu không đồng ý với seller)
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
          message: "Không tìm thấy yêu cầu hoàn tiền",
        });
      }

      if (refund.status !== "rejected") {
        return res.status(400).json({
          success: false,
          message: "Chỉ có thể khiếu nại khi seller từ chối",
        });
      }

      if (refund.escalatedToAdmin) {
        return res.status(400).json({
          success: false,
          message: "Yêu cầu này đã được chuyển lên admin",
        });
      }

      refund.status = "disputed";
      refund.escalatedToAdmin = true;
      refund.escalatedAt = new Date();
      await refund.save();

      res.json({
        success: true,
        message: "Đã chuyển khiếu nại lên admin. Admin sẽ xem xét trong 24-48h.",
        refund,
      });
    } catch (error) {
      console.error("Error escalating refund:", error);
      res.status(500).json({ success: false, message: "Lỗi server" });
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
          message: "Decision phải là 'refund' hoặc 'reject'",
        });
      }

      const refund = await Refund.findById(refundId);
      if (!refund) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy yêu cầu hoàn tiền",
        });
      }

      if (refund.status !== "disputed") {
        return res.status(400).json({
          success: false,
          message: "Chỉ admin mới xử lý được dispute",
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

      // Cập nhật order nếu approved
      if (decision === "refund") {
        await Order.findByIdAndUpdate(refund.orderId, {
          status: "refund_approved",
          refundRequestId: refund._id,
        });
      }

      res.json({
        success: true,
        message:
          decision === "refund"
            ? "Admin đã chấp nhận hoàn tiền"
            : "Admin đã từ chối yêu cầu",
        refund,
      });
    } catch (error) {
      console.error("Error admin handling refund:", error);
      res.status(500).json({ success: false, message: "Lỗi server" });
    }
  }

  /**
   * Đánh dấu đã hoàn tiền xong
   * PUT /api/v1/refunds/:refundId/complete
   */
  async completeRefund(req, res) {
    try {
      const { refundId } = req.params;
      const sellerId = req.accountID;

      const refund = await Refund.findOne({ _id: refundId, sellerId });
      if (!refund) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy yêu cầu hoàn tiền",
        });
      }

      if (refund.status !== "approved") {
        return res.status(400).json({
          success: false,
          message: "Yêu cầu chưa được chấp nhận",
        });
      }

      refund.status = "completed";
      refund.refundedAt = new Date();
      await refund.save();

      // Cập nhật order
      await Order.findByIdAndUpdate(refund.orderId, {
        status: "refunded",
      });

      res.json({
        success: true,
        message: "Đã hoàn tiền thành công",
        refund,
      });
    } catch (error) {
      console.error("Error completing refund:", error);
      res.status(500).json({ success: false, message: "Lỗi server" });
    }
  }

  /**
   * Chi tiết 1 refund
   * GET /api/v1/refunds/:refundId
   */
  async getRefundById(req, res) {
    try {
      const { refundId } = req.params;
      const userId = req.accountID;

      const refund = await Refund.findById(refundId)
        .populate("buyerId", "fullName email phoneNumber avatar")
        .populate("sellerId", "fullName email phoneNumber avatar")
        .populate("orderId")
        .lean();

      if (!refund) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy yêu cầu hoàn tiền",
        });
      }

      // Check quyền xem
      const isBuyer = refund.buyerId._id.toString() === userId.toString();
      const isSeller = refund.sellerId._id.toString() === userId.toString();
      const isAdmin = req.accountRole === "admin";

      if (!isBuyer && !isSeller && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền xem yêu cầu này",
        });
      }

      res.json({
        success: true,
        refund,
      });
    } catch (error) {
      console.error("Error fetching refund:", error);
      res.status(500).json({ success: false, message: "Lỗi server" });
    }
  }

  /**
   * Admin: Lấy tất cả refunds (bao gồm disputed)
   * GET /api/v1/refunds/admin/all
   */
  async getAllRefundsAdmin(req, res) {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const filter = {};
      if (status) filter.status = status;

      const [refunds, total] = await Promise.all([
        Refund.find(filter)
          .populate("buyerId", "fullName email")
          .populate("sellerId", "fullName email")
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
      res.status(500).json({ success: false, message: "Lỗi server" });
    }
  }
}

module.exports = new RefundController();
