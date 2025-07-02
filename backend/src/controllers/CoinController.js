const Coin = require("../models/Coin");
const Account = require("../models/Account");

class CoinController {
  // Điểm danh nhận xu
  async checkIn(req, res) {
    try {
      const userId = req.accountID;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Kiểm tra xem người dùng đã điểm danh hôm nay chưa
      let coinAccount = await Coin.findOne({ userId });

      if (!coinAccount) {
        // Nếu chưa có tài khoản coin thì tạo mới
        coinAccount = new Coin({
          userId,
          balance: 200,
          lastCheckIn: today,
        });
        await coinAccount.save();
        return res.json({
          status: "success",
          message: "Điểm danh thành công! Nhận được 200 xu",
          balance: coinAccount.balance,
        });
      }

      if (coinAccount.lastCheckIn >= today) {
        return res.json({
          status: "error",
          message: "Bạn đã điểm danh hôm nay rồi",
        });
      }

      // Cập nhật xu và ngày điểm danh cuối
      coinAccount.balance += 200;
      coinAccount.lastCheckIn = today;
      await coinAccount.save();

      res.json({
        status: "success",
        message: "Điểm danh thành công! Nhận được 200 xu",
        balance: coinAccount.balance,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: "Lỗi server" });
    }
  }

  // Lấy số dư xu
  async getBalance(req, res) {
    try {
      const userId = req.accountID;
      const coinAccount = await Coin.findOne({ userId });

      if (!coinAccount) {
        return res.json({
          status: "success",
          balance: 0,
        });
      }

      res.json({
        status: "success",
        balance: coinAccount.balance,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: "Lỗi server" });
    }
  }

  // Sử dụng xu (khi thanh toán)
  async useCoins(req, res) {
    try {
      const userId = req.accountID;
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          status: "error",
          message: "Số xu không hợp lệ",
        });
      }

      const coinAccount = await Coin.findOne({ userId });

      if (!coinAccount || coinAccount.balance < amount) {
        return res.status(400).json({
          status: "error",
          message: "Không đủ xu",
        });
      }

      coinAccount.balance -= amount;
      await coinAccount.save();

      res.json({
        status: "success",
        message: "Sử dụng xu thành công",
        newBalance: coinAccount.balance,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: "Lỗi server" });
    }
  }
}

module.exports = new CoinController();