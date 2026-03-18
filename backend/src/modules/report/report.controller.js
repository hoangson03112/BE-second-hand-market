const { uploadSingle } = require("../../utils/CloudinaryUpload");
const Report = require("../../models/Report");
const { MESSAGES } = require('../../utils/messages');

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
          message: MESSAGES.REPORT.ALREADY_REPORTED,
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
    const { page = 1, limit = 20, status, startDate, endDate } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

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

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate({
          path: "reporterId",
          select: "fullName email phoneNumber avatar",
        })
        .populate({
          path: "targetId",
          populate: [
            { path: "products.productId", model: "Product" },
            { path: "shippingAddress", model: "Address" },
            { path: "sellerId", model: "Account", select: "fullName email phoneNumber avatar" },
            { path: "buyerId", model: "Account", select: "fullName email phoneNumber avatar" },
          ],
        })
        .exec(),
      Report.countDocuments(filter),
    ]);

    res.json({
      success: true,
      reports,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalItems: total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


