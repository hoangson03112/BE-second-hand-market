const Account = require("../models/Account");
const Conversation = require("../models/Conversation");
const PersonalDiscount = require("../models/PersonalDiscount");
class PersonalDiscountController {
  async createPersonalDiscount(req, res) {
    try {
      const { productId, buyerId, price, endDate } = req.body;
      const sellerId = req.accountID; // Lấy từ token đăng nhập

      if (!productId || !buyerId || !price || !endDate) {
        return res
          .status(400)
          .json({ message: "Vui lòng điền đầy đủ thông tin!" });
      }
      if (price <= 0) {
        return res.status(400).json({ message: "Giá phải lớn hơn 0!" });
      }
      if (new Date(endDate) <= Date.now()) {
        return res
          .status(400)
          .json({ message: "Ngày kết thúc phải sau thời điểm hiện tại!" });
      }

      const existing = await PersonalDiscount.findOne({
        productId,
        buyerId,
        sellerId,
 
      });
      if (existing) {
        return res.status(400).json({
          message: "Đã có deal đang hoạt động cho buyer này với sản phẩm này!",
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
      res.status(201).json({ message: "Tạo deal thành công!", deal: newDeal });
    } catch (error) {
      console.error("Error creating personal discount:", error);
      res.status(500).json({ message: "Có lỗi xảy ra khi tạo deal." });
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
        message: "Server error",
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
          message: "Deal không tồn tại hoặc không thuộc quyền của bạn.",
        });
      }
      // Có thể chọn xóa cứng hoặc chỉ set isUse = false
      deal.isUse = false;
      await deal.save();
      res.status(200).json({ message: "Đã hủy deal thành công." });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
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
        message: "Server error",
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
        return res.status(404).json({ message: "Không tìm thấy deal" });
      }
      res.status(200).json({ success: true, data: discount });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }
}

module.exports = new PersonalDiscountController();
