const BankInfo = require("../models/BankInfo");
const { uploadToCloudinary } = require("../utils/CloudinaryUpload");
const { formatFileForDB } = require("../utils/uploadHelpers");

const BankInfoController = {
  // Upload ảnh chuyển khoản + snapshot bank info seller cho 1 order
  // Request body: { orderId, sellerBankName, sellerAccountNumber, sellerAccountHolder, transferredAt? }
  // Request file:  proofImage (ảnh biên lai)
  async uploadPaymentProof(req, res) {
    try {
      const { orderId, sellerBankName, sellerAccountNumber, sellerAccountHolder, transferredAt } = req.body;
      if (!orderId || !sellerBankName || !sellerAccountNumber || !sellerAccountHolder) {
        return res.status(400).json({ message: "Thiếu thông tin bắt buộc." });
      }
      if (!req.file) {
        return res.status(400).json({ message: "Thiếu ảnh chuyển khoản." });
      }

      const uploaded = await uploadToCloudinary(req.file, "bank-proofs");
      const proofImage = formatFileForDB(uploaded);

      const bankInfo = await BankInfo.findOneAndUpdate(
        { buyerId: req.accountID, orderId },
        {
          buyerId: req.accountID,
          orderId,
          sellerBankSnapshot: {
            bankName: sellerBankName,
            accountNumber: sellerAccountNumber,
            accountHolder: sellerAccountHolder,
          },
          proofImage,
          transferredAt: transferredAt ? new Date(transferredAt) : new Date(),
          // Reset về pending nếu buyer upload lại
          status: "pending",
          verifiedBy: null,
          verifiedAt: null,
          rejectReason: null,
        },
        { new: true, upsert: true }
      );

      return res.status(201).json({ bankInfo });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Lỗi server", error: error.message });
    }
  },

  // Admin verify hoặc reject proof chuyển khoản
  async verifyPaymentProof(req, res) {
    try {
      const { orderId } = req.params;
      const { status, rejectReason } = req.body;

      if (!["verified", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Status không hợp lệ." });
      }
      if (status === "rejected" && !rejectReason) {
        return res.status(400).json({ message: "Cần nhập lý do từ chối." });
      }

      const bankInfo = await BankInfo.findOneAndUpdate(
        { orderId },
        {
          status,
          verifiedBy: req.accountID,
          verifiedAt: new Date(),
          rejectReason: status === "rejected" ? rejectReason : null,
        },
        { new: true }
      );

      if (!bankInfo) {
        return res.status(404).json({ message: "Không tìm thấy thông tin thanh toán." });
      }

      return res.json({ bankInfo });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Lỗi server", error: error.message });
    }
  },

  // Lấy danh sách tất cả proof (admin)
  async getAllOrderRefund(req, res) {
    try {
      const { status } = req.query;
      const filter = status ? { status } : {};

      const bankInfo = await BankInfo.find(filter)
        .populate("buyerId", "fullName email")
        .populate("orderId", "ghnOrderCode totalAmount paymentMethod")
        .populate("verifiedBy", "fullName")
        .sort({ createdAt: -1 });
      return res.json({ bankInfo });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Lỗi server", error: error.message });
    }
  },

  // Lấy proof của 1 order cụ thể
  async getProofByOrder(req, res) {
    try {
      const { orderId } = req.params;
      const bankInfo = await BankInfo.findOne({ orderId })
        .populate("buyerId", "fullName email")
        .populate("verifiedBy", "fullName");

      if (!bankInfo) {
        return res.status(404).json({ message: "Không tìm thấy thông tin thanh toán." });
      }
      return res.json({ bankInfo });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Lỗi server", error: error.message });
    }
  },
};

module.exports = BankInfoController;
