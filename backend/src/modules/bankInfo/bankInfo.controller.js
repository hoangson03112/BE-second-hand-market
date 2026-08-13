const BankInfo = require("../../models/BankInfo");
const { uploadToCloudinary } = require("../../utils/CloudinaryUpload");
const { formatFileForDB } = require("../../utils/uploadHelpers");
const { MESSAGES } = require('../../utils/messages');

const BankInfoController = {



  async uploadPaymentProof(req, res) {
    try {
      const { orderId, sellerBankName, sellerAccountNumber, sellerAccountHolder, transferredAt } = req.body;
      if (!orderId || !sellerBankName || !sellerAccountNumber || !sellerAccountHolder) {
        return res.status(400).json({ message: MESSAGES.BANK_INFO.MISSING_INFO });
      }
      if (!req.file) {
        return res.status(400).json({ message: MESSAGES.BANK_INFO.MISSING_TRANSFER_IMAGE });
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
            accountHolder: sellerAccountHolder
          },
          proofImage,
          transferredAt: transferredAt ? new Date(transferredAt) : new Date(),

          status: "pending",
          verifiedBy: null,
          verifiedAt: null,
          rejectReason: null
        },
        { new: true, upsert: true }
      );

      return res.status(201).json({ bankInfo });
    } catch (error) {
      return res.
      status(500).
      json({ message: MESSAGES.SERVER_ERROR, error: error.message });
    }
  },


  async verifyPaymentProof(req, res) {
    try {
      const { orderId } = req.params;
      const { status, rejectReason } = req.body;

      if (!["verified", "rejected"].includes(status)) {
        return res.status(400).json({ message: MESSAGES.BANK_INFO.INVALID_STATUS });
      }
      if (status === "rejected" && !rejectReason) {
        return res.status(400).json({ message: MESSAGES.BANK_INFO.REJECT_REASON_REQUIRED });
      }

      const bankInfo = await BankInfo.findOneAndUpdate(
        { orderId },
        {
          status,
          verifiedBy: req.accountID,
          verifiedAt: new Date(),
          rejectReason: status === "rejected" ? rejectReason : null
        },
        { new: true }
      );

      if (!bankInfo) {
        return res.status(404).json({ message: MESSAGES.BANK_INFO.NOT_FOUND });
      }

      return res.json({ bankInfo });
    } catch (error) {
      return res.
      status(500).
      json({ message: MESSAGES.SERVER_ERROR, error: error.message });
    }
  },


  async getAllOrderRefund(req, res) {
    try {
      const { status } = req.query;
      const filter = status ? { status } : {};

      const bankInfo = await BankInfo.find(filter).
      populate("buyerId", "fullName email").
      populate("orderId", "ghnOrderCode totalAmount paymentMethod").
      populate("verifiedBy", "fullName").
      sort({ createdAt: -1 });
      return res.json({ bankInfo });
    } catch (error) {
      return res.
      status(500).
      json({ message: MESSAGES.SERVER_ERROR, error: error.message });
    }
  },


  async getProofByOrder(req, res) {
    try {
      const { orderId } = req.params;
      const bankInfo = await BankInfo.findOne({ orderId }).
      populate("buyerId", "fullName email").
      populate("verifiedBy", "fullName");

      if (!bankInfo) {
        return res.status(404).json({ message: MESSAGES.BANK_INFO.NOT_FOUND });
      }
      return res.json({ bankInfo });
    } catch (error) {
      return res.
      status(500).
      json({ message: MESSAGES.SERVER_ERROR, error: error.message });
    }
  }
};

module.exports = BankInfoController;