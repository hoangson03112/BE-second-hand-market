const BankInfo = require("../models/BankInfo");

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
