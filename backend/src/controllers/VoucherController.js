const Voucher = require("../models/Voucher");

class VoucherController {

  async createVoucher(req, res) {
  try {
    const {
      code,
      discountType,
      discountValue,
      usageLimit,
      maxDiscountAmount,
      startDate,
      endDate,
    } = req.body;

    // Validation - chỉ kiểm tra các trường bắt buộc
    if (!code || !discountType || !discountValue || !startDate || !endDate) {
      return res.status(400).json({ message: "Vui lòng điền đầy đủ thông tin bắt buộc!" });
    }

    // Kiểm tra giá trị discount hợp lệ
    if (discountValue <= 0) {
      return res.status(400).json({ message: "Giá trị giảm giá phải lớn hơn 0!" });
    }

    // Kiểm tra phần trăm không vượt quá 100%
    if (discountType === 'PERCENTAGE' && discountValue > 100) {
      return res.status(400).json({ message: "Giảm giá phần trăm không thể vượt quá 100%!" });
    }

    // Kiểm tra ngày
    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ message: "Ngày kết thúc phải sau ngày bắt đầu!" });
    }

    // Kiểm tra usageLimit nếu có
    if (usageLimit && usageLimit <= 0) {
      return res.status(400).json({ message: "Số lần sử dụng phải lớn hơn 0!" });
    }

    // Kiểm tra maxDiscountAmount nếu có
    if (maxDiscountAmount && maxDiscountAmount <= 0) {
      return res.status(400).json({ message: "Giá trị giảm tối đa phải lớn hơn 0!" });
    }

    // Kiểm tra mã voucher đã tồn tại
    const existingVoucher = await Voucher.findOne({ code: code.toUpperCase() });
    if (existingVoucher) {
      return res.status(400).json({ message: "Mã voucher đã tồn tại!" });
    }

    const newVoucher = new Voucher({
      code: code.toUpperCase(),
      discountType,
      discountValue,
      usageLimit: usageLimit || null,
      maxDiscountAmount: maxDiscountAmount || null,
      startDate,
      endDate,
      createdBy: req.accountID,
      isActive: true
    });

    await newVoucher.save();
    res.status(201).json({ 
      message: "Tạo voucher thành công!",
      voucher: newVoucher 
    });
  } catch (error) {
    console.error("Error creating voucher:", error);
    res.status(500).json({ message: "Có lỗi xảy ra khi tạo voucher." });
  }
}

async getAllVouchers(req, res) {
  try {
    const sellerId = req.accountID;

    const vouchers = await Voucher.find({ createdBy: sellerId }) 
      .populate("createdBy", "username email")
      .sort({ createdAt: -1 });

    res.status(200).json({ vouchers });
  } catch (error) {
    console.error("Error fetching vouchers:", error);
    res.status(500).json({ message: "Server error" });
  }
}


async updateVoucher(req, res) {
  try {
    const { id } = req.params;
    const {
      discountType,
      discountValue,
      usageLimit,
      maxDiscountAmount,
      startDate,
      endDate,
    } = req.body;

    if (discountValue !== undefined && discountValue <= 0) {
      return res.status(400).json({ message: "Giá trị giảm giá phải lớn hơn 0!" });
    }

    if (discountType === 'PERCENTAGE' && discountValue > 100) {
      return res.status(400).json({ message: "Giảm giá phần trăm không thể vượt quá 100%!" });
    }

    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ message: "Ngày kết thúc phải sau ngày bắt đầu!" });
    }

    if (usageLimit !== undefined && usageLimit !== null && usageLimit <= 0) {
      return res.status(400).json({ message: "Số lần sử dụng phải lớn hơn 0!" });
    }

    if (maxDiscountAmount !== undefined && maxDiscountAmount !== null && maxDiscountAmount <= 0) {
      return res.status(400).json({ message: "Giá trị giảm tối đa phải lớn hơn 0!" });
    }

    const updateData = {};
    if (discountType !== undefined) updateData.discountType = discountType;
    if (discountValue !== undefined) updateData.discountValue = discountValue;
    if (usageLimit !== undefined) updateData.usageLimit = usageLimit;
    if (maxDiscountAmount !== undefined) updateData.maxDiscountAmount = maxDiscountAmount;
    if (startDate !== undefined) updateData.startDate = startDate;
    if (endDate !== undefined) updateData.endDate = endDate;

    const voucher = await Voucher.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!voucher) {
      return res.status(404).json({ message: "Không tìm thấy voucher!" });
    }

    res.status(200).json({ 
      message: "Cập nhật voucher thành công!",
      voucher 
    });
  } catch (error) {
    console.error("Error updating voucher:", error);
    res.status(500).json({ message: "Server error" });
  }
}

async deleteVoucher(req, res) {
  try {
    const { id } = req.params;

    const voucher = await Voucher.findByIdAndDelete(id);
    if (!voucher) {
      return res.status(404).json({ message: "Không tìm thấy voucher!" });
    }

    res.status(200).json({ message: "Xóa voucher thành công!" });
  } catch (error) {
    console.error("Error deleting voucher:", error);
    res.status(500).json({ message: "Server error" });
  }
}

  // User kiểm tra và áp dụng voucher
  async applyVoucher(req, res) {
    try {
      const { code, orderAmount } = req.body;

      if (!code || !orderAmount) {
        return res.status(400).json({ message: "Vui lòng cung cấp mã voucher và tổng đơn hàng!" });
      }

      const voucher = await Voucher.findOne({ 
        code: code.toUpperCase(),
        isActive: true 
      });

      if (!voucher) {
        return res.status(404).json({ message: "Mã voucher không tồn tại hoặc đã bị vô hiệu hóa!" });
      }

      const now = new Date();
      
      // Kiểm tra thời gian hiệu lực
      if (now < voucher.startDate || now > voucher.endDate) {
        return res.status(400).json({ message: "Voucher đã hết hạn hoặc chưa có hiệu lực!" });
      }

      // Kiểm tra số lần sử dụng
      if (voucher.usageLimit && voucher.usedCount >= voucher.usageLimit) {
        return res.status(400).json({ message: "Voucher đã hết lượt sử dụng!" });
      }

      // Kiểm tra giá trị đơn hàng tối thiểu
      if (orderAmount < voucher.minOrderAmount) {
        return res.status(400).json({ 
          message: `Đơn hàng phải có giá trị tối thiểu $${voucher.minOrderAmount}!` 
        });
      }

      // Tính toán giảm giá
      let discountAmount = 0;
      if (voucher.discountType === "PERCENTAGE") {
        discountAmount = (orderAmount * voucher.discountValue) / 100;
        if (voucher.maxDiscountAmount && discountAmount > voucher.maxDiscountAmount) {
          discountAmount = voucher.maxDiscountAmount;
        }
      } else {
        discountAmount = voucher.discountValue;
      }

      // Không cho phép giảm giá vượt quá tổng đơn hàng
      if (discountAmount > orderAmount) {
        discountAmount = orderAmount;
      }

      res.status(200).json({
        message: "Áp dụng voucher thành công!",
        voucher: {
          id: voucher._id,
          code: voucher.code,
          name: voucher.name,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
        },
        discountAmount: Math.round(discountAmount * 100) / 100,
        finalAmount: Math.round((orderAmount - discountAmount) * 100) / 100,
      });
    } catch (error) {
      console.error("Error applying voucher:", error);
      res.status(500).json({ message: "Server error" });
    }
  }

  // Cập nhật số lần sử dụng voucher (gọi khi tạo đơn hàng thành công)
  async useVoucher(req, res) {
    try {
      const { voucherId } = req.body;

      if (!voucherId) {
        return res.status(400).json({ message: "Vui lòng cung cấp ID voucher!" });
      }

      const voucher = await Voucher.findByIdAndUpdate(
        voucherId,
        { $inc: { usedCount: 1 } },
        { new: true }
      );

      if (!voucher) {
        return res.status(404).json({ message: "Không tìm thấy voucher!" });
      }

      res.status(200).json({ message: "Cập nhật sử dụng voucher thành công!" });
    } catch (error) {
      console.error("Error using voucher:", error);
      res.status(500).json({ message: "Server error" });
    }
  }

  // User lấy danh sách voucher có thể sử dụng
  async getAvailableVouchers(req, res) {
    try {
      const now = new Date();
      
      const vouchers = await Voucher.find({
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
        $or: [
          { usageLimit: null },
          { $expr: { $lt: ["$usedCount", "$usageLimit"] } }
        ]
      }).select("-createdBy").sort({ createdAt: -1 });

      res.status(200).json({ vouchers });
    } catch (error) {
      console.error("Error fetching available vouchers:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
}

module.exports = new VoucherController();