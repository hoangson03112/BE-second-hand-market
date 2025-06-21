const Seller = require("../models/Seller");
const path = require("path");
const { uploadFieldsToCloudinary } = require("../utils/CloudinaryUpload");
const Account = require("../models/Account");

class SellerController {
  async registerSeller(req, res) {
    try {
      const {
        address,
        province,
        district,
        ward,
        bankName,
        accountNumber,
        accountHolder,
        agreeTerms,
        agreePolicy,
      } = req.body;
      const registerSeller = await Seller.findOne({ accountId: req.accountID });
      if (!!registerSeller) {
        return res.status(400).json({
          success: false,
          message: "Bạn đã đăng ký làm Seller rồi! Vui lòng đợi duyệt",
        });
      }
      const existingSeller = await Account.findById(req.accountID);
      if (existingSeller.role == "seller") {
        return res.status(400).json({
          success: false,
          message: "Bạn đã  làm Seller rồi!",
        });
      }

      // Validation
      if (!req.files || !req.files.idCardFront || !req.files.idCardBack) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng tải lên ảnh CCCD mặt trước và mặt sau",
        });
      }

      if (!agreeTerms || !agreePolicy) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng đồng ý với điều khoản và chính sách",
        });
      }

      const uploadedFiles = await uploadFieldsToCloudinary(req.files, "Seller");

      // Helper function để format file data
      const formatFileData = (fileData) => {
        if (!fileData) return null;
        return {
          url: fileData.url,
          publicId: fileData.publicId,
          originalName: fileData.name,
          type: fileData.type,
          size: fileData.size,
          uploadedAt: new Date(),
        };
      };

      // Tạo seller record mới
      const newSeller = await Seller.create({
        accountId: req.accountID,
        businessAddress: address,
        province,
        district,
        ward,
        idCardFront: formatFileData(uploadedFiles.idCardFront),
        idCardBack: formatFileData(uploadedFiles.idCardBack),
        bankInfo: {
          bankName,
          accountNumber,
          accountHolder,
        },
        agreeTerms: agreeTerms === "true",
        agreePolicy: agreePolicy === "true",
      });

      // Cập nhật role của user thành seller
      await Account.findByIdAndUpdate(req.accountID, {
        avatar: formatFileData(uploadedFiles.avatar),
      });

      res.status(201).json({
        success: true,
        message:
          "🎉 Đăng ký Seller thành công! Chúng tôi sẽ xem xét và phản hồi trong vòng 24h. Cảm ơn bạn đã tham gia!",
      });
    } catch (error) {
      console.error("Error registering seller:", error);
      res.status(500).json({
        success: false,
        message:
          "❌ Đăng ký thất bại! Vui lòng kiểm tra kết nối mạng và thử lại.",
        error: error.message,
      });
    }
  }

  // Lấy danh sách seller để admin duyệt
  async getAllSellers(req, res) {
    try {
      const { status, page = 1, limit = 10 } = req.query;

      let filter = {};
      if (status && ["pending", "approved", "rejected"].includes(status)) {
        filter.verificationStatus = status;
      }

      const skip = (page - 1) * limit;

      const sellers = await Seller.find(filter)
        .populate("accountId", "fullName email phoneNumber createdAt avatar")
        .populate("reviewedBy", "fullName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Seller.countDocuments(filter);

      const statistics = {
        total: await Seller.countDocuments(),
        pending: await Seller.countDocuments({ verificationStatus: "pending" }),
        approved: await Seller.countDocuments({
          verificationStatus: "approved",
        }),
        rejected: await Seller.countDocuments({
          verificationStatus: "rejected",
        }),
      };

      res.status(200).json({
        success: true,
        data: sellers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
        statistics,
      });
    } catch (error) {
      console.error("Error fetching sellers:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi lấy danh sách seller",
        error: error.message,
      });
    }
  }

  // Lấy chi tiết seller
  async getSellerById(req, res) {
    try {
      const { id } = req.params;

      const seller = await Seller.findById(id)
        .populate("accountId", "fullName email phoneNumber createdAt avatar")
        .populate("reviewedBy", "fullName email");

      if (!seller) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy seller",
        });
      }

      res.status(200).json({
        success: true,
        data: seller,
      });
    } catch (error) {
      console.error("Error fetching seller details:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi lấy thông tin seller",
        error: error.message,
      });
    }
  }

  // Duyệt hoặc từ chối seller
  async updateSellerStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, rejectedReason } = req.body;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Trạng thái không hợp lệ",
        });
      }

      if (status === "rejected" && !rejectedReason) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập lý do từ chối",
        });
      }

      const updateData = {
        verificationStatus: status,
        reviewedBy: req.accountID,
        ...(status === "approved" && { approvedDate: new Date() }),
        ...(status === "rejected" && { rejectedReason }),
      };

      const seller = await Seller.findByIdAndUpdate(id, updateData, {
        new: true,
      }).populate("accountId", "fullName email phoneNumber");

      if (!seller) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy seller",
        });
      }

      // Nếu duyệt thành công, cập nhật role của account thành seller
      if (status === "approved") {
        await Account.findByIdAndUpdate(seller.accountId._id, {
          role: "seller",
        });
      }

      res.status(200).json({
        success: true,
        message:
          status === "approved"
            ? "Duyệt seller thành công!"
            : "Từ chối seller thành công!",
        data: seller,
      });
    } catch (error) {
      console.error("Error updating seller status:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi cập nhật trạng thái seller",
        error: error.message,
      });
    }
  }
}

module.exports = {
  controller: new SellerController(),
};
