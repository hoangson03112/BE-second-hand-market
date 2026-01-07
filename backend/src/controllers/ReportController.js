const { uploadSingle } = require("../utils/CloudinaryUpload");
const Report = require("../models/Report");
const Order = require("../models/Order");

exports.createReport = async (req, res) => {
  try {
    if (req.body.type === "order" && req.body.targetId) {
      const existingReport = await Report.findOne({
        type: "order",
        targetId: req.body.targetId,
        reporterId: req.accountID,
        status: { $in: ["pending"] },
      });
      if (existingReport) {
        return res.status(400).json({
          success: false,
          message: "Bạn đã gửi báo cáo cho đơn hàng này. Vui lòng chờ xử lý!",
        });
      }
    }
    let images = [];

    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map((file) =>
        uploadSingle(file, { folder: "Report" }).then((uploadRes) => ({
          url: uploadRes.secure_url,
          publicId: uploadRes.public_id, // Đúng key!
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        }))
      );
      images = await Promise.all(uploadPromises);
    }
    // Tạo report với images nếu có, hoặc như cũ nếu không có ảnh
    const report = new Report({
      ...req.body,
      reporterId: req.accountID,
      targetModel:
        req.body.type === "order"
          ? "Order"
          : req.body.type === "product"
          ? "Product"
          : undefined,
      ...(images.length > 0 ? { images } : {}),
    });
    await report.save();
    res.status(201).json({ success: true, report });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getAllReports = async (req, res) => {
  try {
    // Lấy toàn bộ report, không filter, không phân trang
    const reports = await Report.find()
      .sort({ createdAt: -1 })
      .populate({
        path: "reporterId",
        select: "fullName email phoneNumber avatar",
      })
      .populate({
        path: "targetId",
        populate: [
          {
            path: "products.productId",
            model: "Product",
          },
          {
            path: "shippingAddress",
            model: "Address",
          },
          {
            path: "sellerId",
            model: "Account",
            select: "fullName email phoneNumber avatar",
          },
          {
            path: "buyerId",
            model: "Account",
            select: "fullName email phoneNumber avatar",
          },
        ],
      })
      .exec();

    res.json({
      success: true,
      reports,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
// Cập nhật trạng thái báo cáo
exports.updateReportOrderRefund = async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        refundDecision: req.body.status,
        refundDecisionReason: req.body.result,
      },
      {
        new: true,
      }
    );

    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy báo cáo" });
    await Report.findOneAndUpdate(
      { targetId: req.params.id, type: "order" },
      { status: "resolved" },
      {
        new: true,
      }
    );

    res.json({ success: true, order });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
