const mongoose = require("mongoose");
const BankInfo = require("../../models/BankInfo");
const Order = require("../../models/Order");
const Account = require("../../models/Account");
const PaymentService = require("../../services/payment.service");
const NotificationService = require("../../services/notification.service");
const { uploadToCloudinary } = require("../../utils/CloudinaryUpload");
const { formatFileForDB } = require("../../utils/uploadHelpers");
const { MESSAGES } = require('../../utils/messages');


/**
 * Cùng một orderId có thể tồn tại HAI bản ghi BankInfo: biên lai người mua
 * chuyển tiền ("payment_proof") và tài khoản nhận hoàn tiền ("refund_account",
 * do refund.service tạo). Unique index là {orderId, type}, nên mọi truy vấn ở
 * đây bắt buộc phải kèm `type` — thiếu nó là đọc/ghi nhầm sang bản ghi hoàn tiền.
 */
const PROOF_TYPE = "payment_proof";


/** Ngày do client gửi lên có thể là chuỗi rác — rơi về "bây giờ" thay vì cast lỗi. */
function parseTransferredAt(value) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}


function getIO(req) {
  return req.app.get("io");
}


/** Bắn thông báo ngoài request cycle: lỗi realtime không được làm hỏng API. */
function notify(fn) {
  setImmediate(() => fn().catch((e) => console.error("[notify]", e.message)));
}


async function isAdmin(accountID) {
  const account = await Account.findById(accountID).select("role").lean();
  return account?.role === "admin";
}

const BankInfoController = {



  async uploadPaymentProof(req, res) {
    try {
      const { orderId, bankName, accountNumber, accountHolder, transferredAt } = req.body;
      if (!orderId || !bankName || !accountNumber || !accountHolder) {
        return res.status(400).json({ message: MESSAGES.BANK_INFO.MISSING_INFO });
      }
      if (!req.file) {
        return res.status(400).json({ message: MESSAGES.BANK_INFO.MISSING_TRANSFER_IMAGE });
      }
      if (!mongoose.isValidObjectId(orderId)) {
        return res.status(400).json({ message: MESSAGES.BANK_INFO.INVALID_ORDER_ID });
      }


      // orderId đến từ body nên không thể tin: thiếu bước này thì người dùng
      // gửi đơn của người khác vẫn ghi được bản ghi, và nếu đơn đó đã có biên
      // lai thì unique index bắn duplicate key -> 500 thay vì lỗi nghiệp vụ.
      const order = await Order.findById(orderId).select("buyerId sellerId").lean();
      if (!order) {
        return res.status(404).json({ message: MESSAGES.BANK_INFO.ORDER_NOT_FOUND });
      }
      if (String(order.buyerId) !== String(req.accountID)) {
        return res.status(403).json({ message: MESSAGES.BANK_INFO.FORBIDDEN });
      }

      const uploaded = await uploadToCloudinary(req.file, "bank-proofs");
      const proofImage = formatFileForDB(uploaded);

      const bankInfo = await BankInfo.findOneAndUpdate(
        { orderId, type: PROOF_TYPE },
        {
          buyerId: req.accountID,
          orderId,
          type: PROOF_TYPE,
          sellerBankSnapshot: {
            bankName,
            accountNumber,
            accountHolder
          },
          proofImage,
          transferredAt: parseTransferredAt(transferredAt),

          status: "pending",
          verifiedBy: null,
          verifiedAt: null,
          rejectReason: null
        },
        { new: true, upsert: true }
      );

      notify(() =>
      NotificationService.paymentProofSubmitted({ io: getIO(req), order })
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

      if (!mongoose.isValidObjectId(orderId)) {
        return res.status(400).json({ message: MESSAGES.BANK_INFO.INVALID_ORDER_ID });
      }
      if (!["verified", "rejected"].includes(status)) {
        return res.status(400).json({ message: MESSAGES.BANK_INFO.INVALID_STATUS });
      }
      if (status === "rejected" && !rejectReason) {
        return res.status(400).json({ message: MESSAGES.BANK_INFO.REJECT_REASON_REQUIRED });
      }

      const order = await Order.findById(orderId).
      select("buyerId sellerId paymentMethod").
      lean();
      if (!order) {
        return res.status(404).json({ message: MESSAGES.BANK_INFO.ORDER_NOT_FOUND });
      }


      // Người bán của chính đơn này đối soát; admin giữ quyền để xử lý tranh chấp.
      const isSeller = String(order.sellerId) === String(req.accountID);
      if (!isSeller && !(await isAdmin(req.accountID))) {
        return res.status(403).json({ message: MESSAGES.BANK_INFO.FORBIDDEN });
      }


      // Chặn trước ở đây thay vì để confirmBankTransferPayment ném lỗi phía dưới:
      // lúc đó biên lai đã bị đánh "verified" rồi mới hỏng.
      if (order.paymentMethod !== "bank_transfer") {
        return res.status(400).json({ message: MESSAGES.BANK_INFO.NOT_BANK_TRANSFER });
      }

      const bankInfo = await BankInfo.findOneAndUpdate(
        { orderId, type: PROOF_TYPE },
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


      // Duyệt biên lai và ghi nhận đơn đã thanh toán phải đi cùng nhau: tách ra
      // hai lời gọi thì biên lai "verified" mà đơn vẫn "chờ thanh toán".
      if (status === "verified") {
        const paidOrder = await PaymentService.confirmBankTransferPayment(
          orderId,
          req.accountID
        );
        notify(() =>
        NotificationService.bankTransferConfirmed({ io: getIO(req), order: paidOrder })
        );
      } else {
        notify(() =>
        NotificationService.paymentProofRejected({
          io: getIO(req),
          order,
          reason: rejectReason
        })
        );
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
      const { status, type } = req.query;
      const filter = {};
      if (status) filter.status = status;
      if (type) filter.type = type;

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

      if (!mongoose.isValidObjectId(orderId)) {
        return res.status(400).json({ message: MESSAGES.BANK_INFO.INVALID_ORDER_ID });
      }


      // Route này chỉ có verifyToken, nên nếu không tự kiểm tra thì bất kỳ tài
      // khoản đăng nhập nào cũng đọc được ảnh biên lai và email người mua của
      // đơn bất kỳ. Chỉ hai bên trong đơn và admin mới được xem.
      const order = await Order.findById(orderId).select("buyerId sellerId").lean();
      if (!order) {
        return res.status(404).json({ message: MESSAGES.BANK_INFO.ORDER_NOT_FOUND });
      }

      const viewerId = String(req.accountID);
      const isParty =
      String(order.buyerId) === viewerId || String(order.sellerId) === viewerId;

      if (!isParty && !(await isAdmin(req.accountID))) {
        return res.status(403).json({ message: MESSAGES.BANK_INFO.FORBIDDEN });
      }

      const bankInfo = await BankInfo.findOne({ orderId, type: PROOF_TYPE }).
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
