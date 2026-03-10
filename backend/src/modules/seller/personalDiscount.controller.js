const Account = require("../../models/Account");
const Conversation = require("../../models/Conversation");
const PersonalDiscount = require("../../models/PersonalDiscount");
const { MESSAGES } = require('../../utils/messages');
class PersonalDiscountController {
  async createPersonalDiscount(req, res) {
    try {
      const { productId, buyerId, price, endDate } = req.body;
  const sellerId = req.accountID; // L\u1ea5y t\u1eeb token \u0111\u0103ng nh\u1eadp

      if (!productId || !buyerId || !price || !endDate) {
        return res
          .status(400)
          .json({ message: MESSAGES.DEAL.MISSING_INFO });
      }
      if (price <= 0) {
        return res.status(400).json({ message: MESSAGES.DEAL.PRICE_MUST_BE_POSITIVE });
      }
      if (new Date(endDate) <= Date.now()) {
        return res
          .status(400)
          .json({ message: MESSAGES.DEAL.END_DATE_MUST_BE_FUTURE });
      }

      const existing = await PersonalDiscount.findOne({
        productId,
        buyerId,
        sellerId,
 
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
        filter.isUse = true;
        filter.endDate = { $gt: new Date() };
      } else if (status === "expired") {
        filter.$or = [{ isUse: false }, { endDate: { $lte: new Date() } }];
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
      // C\u00f3 th\u1ec3 ch\u1ecdn x\u00f3a c\u1ee9ng ho\u1eb7c ch\u1ec9 set isUse = false
      deal.isUse = false;
      await deal.save();
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

