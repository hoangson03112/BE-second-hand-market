"use strict";

const BankInfo = require("../../models/BankInfo");
const { MESSAGES } = require("../../utils/messages");

const BankInfoController = {
  /**
   * GET /bank-info
   * Lấy thông tin tài khoản ngân hàng của user hiện tại
   */
  async getMyBankInfo(req, res) {
    try {
      const bankInfo = await BankInfo.findOne({ accountId: req.accountID }).lean();
      return res.status(200).json({
        success: true,
        data: bankInfo || null,
      });
    } catch (error) {
      console.error("[getMyBankInfo error]", error);
      return res.status(500).json({
        success: false,
        message: MESSAGES?.SERVER_ERROR || "Lỗi máy chủ",
        error: error.message,
      });
    }
  },

  /**
   * PUT /bank-info
   * Cập nhật / tạo thông tin tài khoản ngân hàng của user hiện tại
   */
  async updateMyBankInfo(req, res) {
    try {
      const { bankName, accountNumber, accountHolder } = req.body;

      if (!bankName?.trim() || !accountNumber?.trim() || !accountHolder?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập đầy đủ tên ngân hàng, số tài khoản và tên chủ tài khoản.",
        });
      }

      const bankInfo = await BankInfo.findOneAndUpdate(
        { accountId: req.accountID },
        {
          $set: {
            accountId: req.accountID,
            bankName: bankName.trim(),
            accountNumber: accountNumber.trim(),
            accountHolder: accountHolder.trim(),
            updatedAt: new Date(),
          },
        },
        { new: true, upsert: true, runValidators: true }
      );

      return res.status(200).json({
        success: true,
        message: "Cập nhật thông tin ngân hàng thành công.",
        data: bankInfo,
      });
    } catch (error) {
      console.error("[updateMyBankInfo error]", error);
      return res.status(500).json({
        success: false,
        message: MESSAGES?.SERVER_ERROR || "Lỗi máy chủ",
        error: error.message,
      });
    }
  },
};

module.exports = BankInfoController;

