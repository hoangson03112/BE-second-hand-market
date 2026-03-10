const Seller = require("../../models/Seller");
const Product = require("../../models/Product");
const path = require("path");
const { uploadFieldsToCloudinary } = require("../../utils/CloudinaryUpload");
const Account = require("../../models/Account");
const Address = require("../../models/Address");
const { MESSAGES } = require('../../utils/messages');

const UNVERIFIED_SELLER_PRODUCT_LIMIT = 5;

class SellerController {
  /**
   * GET /sellers/request-status
   * Ki\u1ec3m tra tr\u1ea1ng th\u00e1i y\u00eau c\u1ea7u tr\u1edf th\u00e0nh seller c\u1ee7a user hi\u1ec7n t\u1ea1i.
   */
  async getRequestStatus(req, res) {
    try {
      const seller = await Seller.findOne({ accountId: req.accountID }).select(
        "verificationStatus rejectedReason",
      );

      if (!seller) {
        return res.status(200).json({
          hasRequest: false,
          status: null,
        });
      }

      const status =
        seller.verificationStatus === "approved"
          ? "approved"
          : seller.verificationStatus === "rejected"
            ? "rejected"
            : seller.verificationStatus === "pending"
              ? "pending"
              : null;

      return res.status(200).json({
        hasRequest: true,
        status,
        message:
          status === "rejected" && seller.rejectedReason
            ? seller.rejectedReason
            : undefined,
      });
    } catch (error) {
      console.error("Error getRequestStatus:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.SELLER.CHECK_STATUS_ERROR,
        error: error.message,
      });
    }
  }

  /**
   * GET /sellers/product-limit
   * Ki\u1ec3m tra s\u1ed1 l\u01b0\u1ee3ng s\u1ea3n ph\u1ea9m \u0111\u00e3 \u0111\u0103ng v\u00e0 gi\u1edbi h\u1ea1n c\u1ee7a user hi\u1ec7n t\u1ea1i (m\u00f4 h\u00ecnh hybrid).
   */
  async getProductLimit(req, res) {
    try {
      const account = await Account.findById(req.accountID).select("role");
      const isSeller = account && account.role === "seller";

      const totalProducts = await Product.countDocuments({
        sellerId: req.accountID,
      });
      const pendingProducts = await Product.countDocuments({
        sellerId: req.accountID,
        status: { $in: ["pending", "under_review"] },
      });
      const approvedProducts = await Product.countDocuments({
        sellerId: req.accountID,
        status: "approved",
      });

      const requiresVerification =
        !isSeller && totalProducts >= UNVERIFIED_SELLER_PRODUCT_LIMIT;

      return res.status(200).json({
        totalProducts,
        pendingProducts,
        approvedProducts,
        limit: UNVERIFIED_SELLER_PRODUCT_LIMIT,
        requiresVerification,
      });
    } catch (error) {
      console.error("Error getProductLimit:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.SELLER.PRODUCT_LIMIT_ERROR,
        error: error.message,
      });
    }
  }

  async registerSeller(req, res) {
    try {
      console.log(req.body);
      const {
        address,
        bankName,
        accountNumber,
        accountHolder,
        agreeTerms,
        agreePolicy,
        province_id,
        from_district_id,
        from_ward_code,
        phoneNumber,
      } = req.body;
      const registerSeller = await Seller.findOne({ accountId: req.accountID });
      if (registerSeller) {
        const msg =
          registerSeller.verificationStatus === "pending"
            ? "B\u1ea1n \u0111\u00e3 g\u1eedi y\u00eau c\u1ea7u tr\u1edf th\u00e0nh seller. Vui l\u00f2ng ch\u1edd ph\u00ea duy\u1ec7t."
            : registerSeller.verificationStatus === "approved"
              ? "B\u1ea1n \u0111\u00e3 l\u00e0 seller."
              : "B\u1ea1n ch\u01b0a \u0111\u01b0\u1ee3c g\u1eedi y\u00eau c\u1ea7u m\u1ed9t l\u1ea7n. Vui l\u00f2ng li\u00ean h\u1ec7 h\u1ed7 tr\u1ee3 n\u1ebfu c\u1ea7n.";
        return res.status(400).json({
          success: false,
          message: msg,
        });
      }
      const existingSeller = await Account.findById(req.accountID);
      if (existingSeller.role == "seller") {
        return res.status(400).json({
          success: false,
          message: MESSAGES.SELLER.ALREADY_SELLER,
        });
      }

      // Validation
      if (!req.files || !req.files.idCardFront || !req.files.idCardBack) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.SELLER.UPLOAD_ID_CARD,
        });
      }

      if (!agreeTerms || !agreePolicy) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.SELLER.ACCEPT_TERMS,
        });
      }

      const uploadedFiles = await uploadFieldsToCloudinary(req.files, "Seller");

      // Helper function \u0111\u1ec3 format file data
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

      // T\u1ea1o seller record m\u1edbi
      const newSeller = await Seller.create({
        accountId: req.accountID,
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

      // T\u1ea1o Address pickup cho seller (d\u00f9ng khi \u0111\u0103ng s\u1ea3n ph\u1ea9m)
      if (from_district_id && from_ward_code) {
        const account = await Account.findById(req.accountID).select("fullName").lean();
        const pickupAddress = await Address.create({
          accountId: req.accountID,
          fullName: account?.fullName || null,
          provinceId: province_id || "",
          districtId: from_district_id,
          wardCode: from_ward_code,
          specificAddress: address || null,
          phoneNumber: phoneNumber || null,
          isDefault: true,
          type: "pickup",
        });
        await Account.findByIdAndUpdate(req.accountID, {
          avatar: formatFileData(uploadedFiles.avatar),
        });
      } else {
        // Cập nhật role của user thành seller
        await Account.findByIdAndUpdate(req.accountID, {
          avatar: formatFileData(uploadedFiles.avatar),
        });
      }

      res.status(201).json({
        success: true,
        message:
          "\u2b50 \u0110\u0103ng k\u00fd Seller th\u00e0nh c\u00f4ng! Ch\u00fang t\u00f4i s\u1ebd xem x\u00e9t v\u00e0 ph\u1ea3n h\u1ed3i trong v\u00f2ng 24h. C\u1ea3m \u01a1n b\u1ea1n \u0111\u00e3 tham gia!",
      });
    } catch (error) {
      console.error("Error registering seller:", error);
      res.status(500).json({
        success: false,
        message:
          "\ud83d\udeab \u0110\u0103ng k\u00fd th\u1ea5t b\u1ea1i! Vui l\u00f2ng ki\u1ec3m tra k\u1ebft n\u1ed1i m\u1ea1ng v\u00e0 th\u1eed l\u1ea1i.",
        error: error.message,
      });
    }
  }

  // L\u1ea5y danh s\u00e1ch seller \u0111\u1ec3 admin duy\u1ec7t
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
        .populate("approvedBy", "fullName email")
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
        message: MESSAGES.SELLER.LIST_ERROR,
        error: error.message,
      });
    }
  }

  // Lấy chi tiết seller
  async getSellerById(req, res) {
    try {
      const { id } = req.params;

      const seller = await Seller.findById(id).populate(
        "accountId",
        "fullName email phoneNumber createdAt avatar",
      );

      if (!seller) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.SELLER.NOT_FOUND,
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
        message: MESSAGES.SELLER.INFO_ERROR,
        error: error.message,
      });
    }
  }

  // Duy\u1ec7t ho\u1eb7c t\u1eeb ch\u1ed1i seller
  async updateSellerStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, rejectedReason } = req.body;

      if (!["approved", "rejected", "banned"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.SELLER.INVALID_STATUS,
        });
      }

      if (status === "rejected" && !rejectedReason) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.SELLER.REJECT_REASON_REQUIRED,
        });
      }

      const updateData = {
        verificationStatus: status,
        approvedBy: req.accountID,  // admin th\u1ef1c hi\u1ec7n h\u00e0nh \u0111\u1ed9ng
        ...(status === "approved" && { approvedDate: new Date() }),
        ...(status === "rejected" && { rejectedReason }),
      };

      const seller = await Seller.findByIdAndUpdate(id, updateData, {
        new: true,
      }).populate("accountId", "fullName email phoneNumber");

      if (!seller) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.SELLER.NOT_FOUND,
        });
      }

      // N\u1ebfu duy\u1ec7t th\u00e0nh c\u00f4ng, c\u1eadp nh\u1eadt role c\u1ee7a account th\u00e0nh seller
      if (status === "approved") {
        await Account.findByIdAndUpdate(seller.accountId._id, {
          role: "seller",
        });
      }

      res.status(200).json({
        success: true,
        message:
          status === "approved"
            ? "Duy\u1ec7t seller th\u00e0nh c\u00f4ng!"
            : "T\u1eeb ch\u1ed1i seller th\u00e0nh c\u00f4ng!",
        data: seller,
      });
    } catch (error) {
      console.error("Error updating seller status:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.SELLER.UPDATE_STATUS_ERROR,
        error: error.message,
      });
    }
  }
  async getSellerInfo(req, res) {
    const { accountId } = req.params;
    const seller = await Seller.findOne({ accountId: accountId });
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: MESSAGES.SELLER.NOT_FOUND,
      });
    }
    res.status(200).json({
      success: true,
      data: seller,
    });
  }
}

module.exports = {
  controller: new SellerController(),
};

