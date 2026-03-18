const Account = require("../../models/Account");
const Conversation = require("../../models/Conversation");
const PersonalDiscount = require("../../models/PersonalDiscount");
const Product = require("../../models/Product");
const { MESSAGES } = require("../../utils/messages");

class PersonalDiscountController {
  async createPersonalDiscount(req, res) {
    try {
      const { productId, buyerId, price, endDate } = req.body;
      const sellerId = req.accountID;

      if (!productId || !buyerId || !price || !endDate) {
        return res.status(400).json({ message: MESSAGES.DEAL.MISSING_INFO });
      }
      if (price <= 0) {
        return res.status(400).json({ message: MESSAGES.DEAL.PRICE_MUST_BE_POSITIVE });
      }
      if (new Date(endDate) <= Date.now()) {
        return res.status(400).json({ message: MESSAGES.DEAL.END_DATE_MUST_BE_FUTURE });
      }

      const product = await Product.findById(productId).select("sellerId price status").lean();
      if (!product) {
        return res.status(404).json({ message: "Sản phẩm không tồn tại." });
      }
      if (product.sellerId?.toString() !== sellerId.toString()) {
        return res.status(403).json({ message: "Bạn không có quyền tạo deal cho sản phẩm này." });
      }
      if (!["active", "approved"].includes(product.status)) {
        return res.status(400).json({
          message: "Chỉ có thể tạo deal cho sản phẩm đang bán (active/approved).",
        });
      }
      if (price > (product.price || 0)) {
        return res.status(400).json({
          message: "Giá deal không được cao hơn giá gốc sản phẩm.",
        });
      }

      const existing = await PersonalDiscount.findOne({
        productId,
        buyerId,
        sellerId,
        isUse: false,
        endDate: { $gt: new Date() },
      });
      if (existing) {
        return res.status(400).json({
          message: MESSAGES.DEAL.DUPLICATE_DEAL,
        });
      }
      const newDeal = new PersonalDiscount({
        productId,
        sellerId,
        buyerId,
        price,
        endDate,
      });
      await newDeal.save();
      res.status(201).json({ message: MESSAGES.DEAL.CREATE_SUCCESS, deal: newDeal });
    } catch (error) {
      console.error("Error creating personal discount:", error);
      res.status(500).json({ message: MESSAGES.DEAL.CREATE_ERROR });
    }
  }

  async getPersonalDiscounts(req, res) {
    try {
      const sellerId = req.accountID;
      const { productId, buyerId, status } = req.query;
      const filter = { sellerId };
      if (productId) filter.productId = productId;
      if (buyerId) filter.buyerId = buyerId;
      if (status === "active") {
        filter.isUse = false;
        filter.endDate = { $gt: new Date() };
      } else if (status === "expired") {
        filter.$or = [{ isUse: true }, { endDate: { $lte: new Date() } }];
      }
      const deals = await PersonalDiscount.find(filter)
        .populate({
          path: "productId",
          select: "name price avatar stock categoryId",
          populate: { path: "categoryId", select: "name" },
        })
        .populate("buyerId", "fullName email avatar");
      res.status(200).json({ success: true, data: deals });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
        error: error.message,
      });
    }
  }

  async deletePersonalDiscount(req, res) {
    try {
      const sellerId = req.accountID;
      const { id } = req.params;
      const deal = await PersonalDiscount.findOne({ _id: id, sellerId });
      if (!deal) {
        return res.status(404).json({
          message: MESSAGES.DEAL.NOT_FOUND_OR_UNAUTHORIZED,
        });
      }
      await PersonalDiscount.findByIdAndDelete(id);
      res.status(200).json({ message: MESSAGES.DEAL.CANCEL_SUCCESS });
    } catch (error) {
      res.status(500).json({ message: MESSAGES.SERVER_ERROR, error: error.message });
    }
  }
  async getBuyersChattedWithSeller(req, res) {
    try {
      const sellerId = req.accountID;

      const conversations = await Conversation.find({
        participants: { $in: [sellerId] },
      });

      const buyerIds = [
        ...new Set(
          conversations
            .map((c) =>
              c.participants.find((p) => p.toString() !== sellerId.toString())
            )
            .filter(Boolean)
        ),
      ];
      // Lấy thông tin buyer
      const buyers = await Account.find({
        _id: { $in: buyerIds },
      }).select("_id fullName email avatar");
      res.status(200).json({ success: true, data: buyers });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
        error: error.message,
      });
    }
  }
  async getPersonalDiscount(req, res) {
    try {
      const buyerId = req.accountID;
      const discount = await PersonalDiscount.find({
        buyerId,
        isUse: false,
        endDate: { $gt: new Date() },
      });
      if (!discount) {
        return res.status(404).json({ message: MESSAGES.DEAL.NOT_FOUND });
      }
      res.status(200).json({ success: true, data: discount });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
        error: error.message,
      });
    }
  }
}

module.exports = new PersonalDiscountController();

