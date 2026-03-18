const Seller = require("../../models/Seller");
const Product = require("../../models/Product");
const path = require("path");
const { uploadFieldsToCloudinary } = require("../../utils/CloudinaryUpload");
const Account = require("../../models/Account");
const Address = require("../../models/Address");
const { MESSAGES } = require('../../utils/messages');
const { sendSellerApprovedEmail, sendSellerRejectedOrBannedEmail } = require("../../services/email.service");
const Order = require("../../models/Order");
const { cancelShippingOrder } = require("../../services/ghn.service");
const { logAdminAction } = require("../../services/adminAuditLog.service");

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
        const msg = "B\u1ea1n \u0111\u00e3 g\u1eedi y\u00eau c\u1ea7u tr\u1edf th\u00e0nh seller. Vui l\u00f2ng ch\u1edd ph\u00ea duy\u1ec7t.";
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
      const { status, page = 1, limit = 10, startDate, endDate } = req.query;

      let filter = {};
      // verificationStatus chỉ phục vụ duyệt hồ sơ seller (pending/approved/rejected)
      if (status && ["pending", "approved", "rejected"].includes(status)) {
        filter.verificationStatus = status;
      }
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = end;
        }
      }

      const skip = (page - 1) * limit;

      const limitNum = parseInt(limit);
      const pageNum = parseInt(page);

      // Nếu filter status=banned => banned nằm ở Account.status (không nằm trong Seller.verificationStatus)
      let sellers = [];
      let total = 0;
      if (status === "banned") {
        const bannedAgg = await Seller.aggregate([
          { $match: filter },
          {
            $lookup: {
              from: "accounts",
              localField: "accountId",
              foreignField: "_id",
              as: "account",
            },
          },
          { $unwind: "$account" },
          { $match: { "account.status": "banned" } },
          { $sort: { createdAt: -1 } },
          {
            $facet: {
              data: [
                { $skip: (pageNum - 1) * limitNum },
                { $limit: limitNum },
              ],
              total: [{ $count: "count" }],
            },
          },
        ]);
        const first = bannedAgg?.[0] || {};
        sellers = first.data || [];
        total = first.total?.[0]?.count || 0;
        // populate-like shape for frontend compatibility
        await Seller.populate(sellers, [
          { path: "accountId", select: "fullName email phoneNumber createdAt avatar status role" },
          { path: "approvedBy", select: "fullName email" },
        ]);
      } else {
        sellers = await Seller.find(filter)
          .populate("accountId", "fullName email phoneNumber createdAt avatar status role")
          .populate("approvedBy", "fullName email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum);

        total = await Seller.countDocuments(filter);
      }

      // Normalize status for admin UI:
      // "banned" lives in Account.status, but frontend renders based on seller.verificationStatus.
      // So we reflect banned accounts as verificationStatus="banned" in the response.
      const normalizedSellers = (sellers || []).map((s) => {
        const plain = typeof s?.toObject === "function" ? s.toObject() : s;
        const accountStatus = plain?.accountId?.status;
        return {
          ...plain,
          verificationStatus:
            accountStatus === "banned" ? "banned" : plain.verificationStatus,
        };
      });

      const statistics = {
        total: await Seller.countDocuments(),
        pending: await Seller.countDocuments({ verificationStatus: "pending" }),
        approved: await Seller.countDocuments({
          verificationStatus: "approved",
        }),
        rejected: await Seller.countDocuments({
          verificationStatus: "rejected",
        }),
        // seller "banned" dựa theo Account.status
        banned: await Account.countDocuments({ status: "banned", role: "seller" }),
      };

      res.status(200).json({
        success: true,
        data: normalizedSellers,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
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
        "fullName email phoneNumber createdAt avatar status role",
      );

      if (!seller) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.SELLER.NOT_FOUND,
        });
      }

      const plain = typeof seller?.toObject === "function" ? seller.toObject() : seller;
      const accountStatus = plain?.accountId?.status;
      res.status(200).json({
        success: true,
        data: {
          ...plain,
          verificationStatus:
            accountStatus === "banned" ? "banned" : plain.verificationStatus,
        },
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
      let hiddenProductsCount = 0;
      let cancelledOrdersCount = 0;

      // status=banned là hành động "ban seller" nhưng banned nằm ở Account.status
      if (!["approved", "rejected", "banned"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.SELLER.INVALID_STATUS,
        });
      }

      if ((status === "rejected" || status === "banned") && !rejectedReason) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.SELLER.REJECT_REASON_REQUIRED,
        });
      }

      const updateData = {
        ...(status !== "banned" && { verificationStatus: status }),
        approvedBy: req.accountID,
        ...(status === "approved" && { approvedDate: new Date() }),
        ...(status === "rejected" && { rejectedReason }),
      };

      const seller = await Seller.findByIdAndUpdate(id, updateData, {
        new: true,
      }).populate("accountId", "fullName email phoneNumber status role");

      if (!seller) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.SELLER.NOT_FOUND,
        });
      }

      if (status === "approved") {
        await Account.findByIdAndUpdate(seller.accountId._id, {
          role: "seller",
          status: "active",
        });
      }

      if (status === "banned") {
        await Account.findByIdAndUpdate(seller.accountId._id, {
          status: "banned",
        });

        // Ẩn toàn bộ sản phẩm đang hiển thị của seller này
        try {
          const productUpdateResult = await Product.updateMany(
            {
              sellerId: seller.accountId._id,
              status: { $in: ["approved", "active"] },
            },
            { $set: { status: "inactive" } }
          );
          hiddenProductsCount =
            typeof productUpdateResult?.modifiedCount === "number"
              ? productUpdateResult.modifiedCount
              : 0;
        } catch (e) {
          console.error("Lỗi cập nhật trạng thái sản phẩm khi khóa seller:", e.message);
        }

        // Tự động hủy các đơn chưa giao cho GHN mà seller này đang bán
        try {
          const pendingOrders = await Order.find({
            sellerId: seller.accountId._id,
            status: { $in: ["pending", "confirmed"] },
          }).select("_id status statusHistory ghnOrderCode");
          cancelledOrdersCount = pendingOrders.length;

          const now = new Date();
          const bulkOps = pendingOrders.map((order) => ({
            updateOne: {
              filter: { _id: order._id },
              update: {
                $set: {
                  status: "cancelled",
                  cancelReason:
                    "Đơn hàng bị hủy do tài khoản người bán bị khóa bởi quản trị viên.",
                  cancelledAt: now,
                },
                $push: {
                  statusHistory: {
                    status: "cancelled",
                    updatedAt: now,
                  },
                },
              },
            },
          }));

          if (bulkOps.length > 0) {
            await Order.bulkWrite(bulkOps);
          }

          // Hủy đơn trên GHN (best-effort)
          for (const order of pendingOrders) {
            if (!order.ghnOrderCode) continue;
            try {
              await cancelShippingOrder(order.ghnOrderCode);
            } catch (e) {
              console.error(
                `Lỗi hủy đơn GHN (${order.ghnOrderCode}) khi khóa seller:`,
                e.message,
              );
            }
          }
        } catch (e) {
          console.error(
            "Lỗi tự động hủy đơn chưa giao khi khóa seller:",
            e.message,
          );
        }
      }

      // Gửi email thông báo cho seller (best-effort)
      const account = seller.accountId;
      const toEmail = account?.email;
      const userName = account?.fullName || "bạn";
      if (toEmail) {
        setImmediate(async () => {
          try {
            if (status === "approved") {
              await sendSellerApprovedEmail(toEmail, userName);
            } else {
              await sendSellerRejectedOrBannedEmail(toEmail, userName, status === "banned", rejectedReason || null);
            }
          } catch (e) {
            console.error("Lỗi gửi email thông báo seller:", e.message);
          }
        });
      }

      try {
        await logAdminAction({
          adminId: req.accountID,
          action:
            status === "approved"
              ? "SELLER_APPROVED"
              : status === "rejected"
                ? "SELLER_REJECTED"
                : "SELLER_BANNED",
          targetType: "Seller",
          targetId: seller._id,
          metadata: {
            accountId: seller.accountId?._id,
            accountEmail: seller.accountId?.email || null,
            verificationStatus: seller.verificationStatus,
            accountStatus: status === "banned" ? "banned" : (seller.accountId?.status || null),
            rejectedReason: rejectedReason || null,
            hiddenProductsCount,
            cancelledOrdersCount,
          },
          req,
        });
      } catch (e) {
        console.error("Lỗi ghi audit log cập nhật trạng thái seller:", e.message);
      }

      res.status(200).json({
        success: true,
        message:
          status === "approved"
            ? "Duyệt seller thành công!"
            : status === "banned"
              ? "Đã khóa seller!"
              : "Từ chối seller thành công!",
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

  /**
   * PUT /sellers/me/bank-info
   * Seller cập nhật thông tin ngân hàng nhận tiền (chỉ seller đã duyệt).
   */
  async updateMyBankInfo(req, res) {
    try {
      const seller = await Seller.findOne({ accountId: req.accountID });
      if (!seller) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.SELLER.NOT_FOUND,
        });
      }
      const { bankName, accountNumber, accountHolder, bankBin } = req.body;
      if (!bankName?.trim() || !accountNumber?.trim() || !accountHolder?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập đầy đủ tên ngân hàng, số tài khoản và chủ tài khoản.",
        });
      }
      seller.bankInfo = {
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountHolder: accountHolder.trim(),
        bankBin: bankBin?.trim() || null,
      };
      await seller.save();
      return res.status(200).json({
        success: true,
        message: MESSAGES.SELLER.BANK_UPDATE_SUCCESS,
        data: seller,
      });
    } catch (error) {
      console.error("Error updating seller bank info:", error);
      return res.status(500).json({
        success: false,
        message: MESSAGES.SELLER.BANK_UPDATE_ERROR,
        error: error.message,
      });
    }
  }
}

module.exports = {
  controller: new SellerController(),
};

