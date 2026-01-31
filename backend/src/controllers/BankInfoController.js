const BankInfo = require("../models/BankInfo");
const { uploadToCloudinary } = require("../utils/CloudinaryUpload");
const { formatFileForDB } = require("../utils/uploadHelpers");

const BankInfoController = {
  // Tạo mới thông tin bank info
  async createBankInfo(req, res) {
    try {
      const { orderId, bankName, accountNumber, accountHolder } = req.body;
      if (!orderId || !bankName || !accountNumber || !accountHolder) {
        return res.status(400).json({ message: "Thiếu thông tin bắt buộc." });
      }
      const bankInfo = new BankInfo({
        userId: req.accountID,
        orderId,
        bankName,
        accountNumber,
        accountHolder,
      });
      await bankInfo.save();
      return res.status(201).json({ bankInfo });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Lỗi server", error: error.message });
    }
  },

  // Upload ảnh chuyển khoản (kèm thông tin bank) cho 1 order
  async uploadPaymentProof(req, res) {
    try {
      const { orderId, bankName, accountNumber, accountHolder } = req.body;
      if (!orderId || !bankName || !accountNumber || !accountHolder) {
        return res.status(400).json({ message: "Thiếu thông tin bắt buộc." });
      }
      if (!req.file) {
        return res.status(400).json({ message: "Thiếu ảnh chuyển khoản." });
      }

      const uploaded = await uploadToCloudinary(req.file, "bank-proofs");
      const proofImage = formatFileForDB(uploaded);

      const bankInfo = await BankInfo.findOneAndUpdate(
        { userId: req.accountID, orderId },
        { bankName, accountNumber, accountHolder, proofImage },
        { new: true, upsert: true }
      );

      return res.status(201).json({ bankInfo });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Lỗi server", error: error.message });
    }
  },

  async getAllOrderRefund(req, res) {
    try {
      const bankInfo = await BankInfo.find({})
        .populate("userId", "fullName")
        .populate("orderId", "ghnOrderCode")
        .sort({ createdAt: -1 });
      return res.json({ bankInfo });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Lỗi server", error: error.message });
    }
  },
};

module.exports = BankInfoController;
