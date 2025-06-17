const Seller = require("../models/Seller");
const path = require("path");
class SellerController {
  async registerSeller(req, res) {
    try {
      console.log("Body data:", req.files);

      const {
        address,
        province,
        district,
        ward,
        bankName,
        accountNumber,
        accountHolder,
        agreeTerms,
        agreePolicy,
      } = req.body;

      // Lấy user ID từ token
      const accountId = req.accountID;

      // Kiểm tra xem user đã đăng ký seller chưa
      const existingSeller = await Seller.findOne({ accountId });
      if (existingSeller) {
        return res.status(400).json({
          success: false,
          message: "Bạn đã đăng ký làm seller rồi!",
        });
      }

      // Validation
      if (!req.files || !req.files.idCardFront || !req.files.idCardBack) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng tải lên ảnh CCCD mặt trước và mặt sau",
        });
      }

      if (!agreeTerms || !agreePolicy) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng đồng ý với điều khoản và chính sách",
        });
      }

      // Tạo URLs cho các file đã upload
      const avatarUrl = req.files.avatar
        ? `/uploads/sellers/${req.files.avatar[0].filename}`
        : null;
      const idCardFrontUrl = `/uploads/sellers/${req.files.idCardFront[0].filename}`;
      const idCardBackUrl = `/uploads/sellers/${req.files.idCardBack[0].filename}`;

      // Tạo seller record mới
      const newSeller = await Seller.create({
        accountId,
        businessAddress: address,
        province,
        district,
        ward,
        avatar: avatarUrl,
        idCardFront: idCardFrontUrl,
        idCardBack: idCardBackUrl,
        bankInfo: {
          bankName,
          accountNumber,
          accountHolder,
        },
        agreeTerms: agreeTerms === "true",
        agreePolicy: agreePolicy === "true",
      });

      // Cập nhật role của user thành seller
      // await Account.findByIdAndUpdate(accountId, {
      //   role: "seller",
      //   avatar: avatarUrl || undefined, // Cập nhật avatar nếu có
      // });

      res.status(201).json({
        success: true,
        message:
          "Đăng ký seller thành công! Chúng tôi sẽ xem xét và phản hồi trong 24h.",
        data: {
          sellerId: newSeller._id,
          verificationStatus: newSeller.verificationStatus,
        },
      });
    } catch (error) {
      console.error("Error registering seller:", error);

      // Xóa các file đã upload nếu có lỗi
      if (req.files) {
        Object.values(req.files)
          .flat()
          .forEach((file) => {
            const filePath = path.join(uploadDir, file.filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          });
      }

      res.status(500).json({
        success: false,
        message: "Lỗi trong quá trình đăng ký seller",
        error: error.message,
      });
    }
  }
}

module.exports = {
  controller: new SellerController(),
};
