const Account = require("../models/Account");

const GenerateToken = require("../utils/GenerateToken");
const bcrypt = require("bcrypt");

const {
  generateVerificationCode,
  sendVerificationEmail,
} = require("../utils/verifiEmail");

class AccountController {
  async Login(req, res) {
    try {
      let data = req.body;
      const account = await Account.findOne({
        username: data.username,
      });

      if (account) {
        const isMatch = await bcrypt.compare(data.password, account.password);

        if (!isMatch) {
          return res.json({
            status: "password",
            message: " mật khẩu không đúng",
          });
        }
        if (account.status === "active") {
          const token = GenerateToken(account._id);

          return res.json({
            status: "success",
            message: "Login successful",
            token,
            user: account,
          });
        }
        if (account.status === "inactive") {
          return res.json({
            status: "inactive",
            message: "Tài khoản chưa được kích hoạt",
          });
        }
      } else {
        return res.json({
          status: "login",
          message: "Sai tên đăng nhập",
        });
      }
    } catch (error) {
      return res.status(500).json({ status: "error", message: "Server error" });
    }
  }
  async Register(req, res) {
    try {
      const data = req.body;

      const username = await Account.findOne({ username: data.username });
      const email = await Account.findOne({ email: data.email });
      const phoneNumber = await Account.findOne({
        phoneNumber: data.phoneNumber,
      });

      if (username) {
        return res.status(401).json({ status: "error", type: "username" });
      }

      if (email) {
        return res.status(401).json({ status: "error", type: "email" });
      }

      if (phoneNumber) {
        return res.status(401).json({ status: "error", type: "phoneNumber" });
      }

      const verificationCode = generateVerificationCode();
      await sendVerificationEmail(data.email, verificationCode);
      const hashedPassword = await bcrypt.hash(data.password, 10);
      const newAccount = new Account({ ...data, password: hashedPassword });
      await newAccount.save();

      await Account.updateOne(
        { _id: newAccount._id },
        { verificationCode, codeExpires: Date.now() + 15 * 60 * 1000 } // 15 phút hết hạn
      );

      return res.status(201).json({
        status: "success",
        message: "Code sent successfully",
        accountID: newAccount._id,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ status: "error", message: "Server error" });
    }
  }
  async Authentication(req, res) {
    if (req.accountID) {
      try {
        const account = await Account.findById(req.accountID);

        return res.json({
          status: "success",
          account: {
            accountID: req.accountID,
            fullName: account?.fullName,
            avatar: account?.avatar,
            cart: account?.cart,
            role: account?.role,
            email: account.email,
            phoneNumber: account.phoneNumber,
            createdAt: account.createdAt,
            addresses: account.addresses,
          },
        });
      } catch (error) {
        console.log(error);
        return res
          .status(500)
          .json({ status: "error", message: "Server error" });
      }
    }
  }
  async Verify(req, res) {
    const account = await Account.findOne({ _id: req.body.userID });
    const token = GenerateToken(account._id);
    if (!account) {
      return res.status(404).json({
        status: "error",
        message: "Account not found",
      });
    }
    if (
      account.verificationCode === req.body.code &&
      Date.now() < account.codeExpires
    ) {
      account.status = "active";
      account.verificationCode = undefined; // Xóa mã xác thực sau khi thành công
      account.codeExpires = undefined; // Xóa thời gian hết hạn sau khi thành công
      await account.save();

      return res.status(200).json({
        status: "success",
        message: "Account successfully verified",
        token,
      });
    } else {
      // Mã xác thực không hợp lệ hoặc đã hết hạn

      return res.status(400).json({
        status: "error",
        message: "Invalid or expired verification code",
      });
    }
  }
  async createAccountByAdmin(req, res) {
    try {
      let data = req.body;

      const username = await Account.findOne({
        username: data.username,
      });
      const email = await Account.findOne({
        email: data.email,
      });
      const phoneNumber = await Account.findOne({
        phoneNumber: data.phoneNumber,
      });

      if (username) {
        return res.status(401).json({
          status: "error",
          type: "username",
        });
      }

      if (email) {
        return res.status(401).json({
          status: "error",
          type: "email",
        });
      }

      if (phoneNumber) {
        return res.status(401).json({
          status: "error",
          type: "phoneNumber",
        });
      }

      const newAccount = new Account({
        ...data,
        password: await bcrypt.hash("123456", 10),
      });
      await newAccount.save();

      return res.status(201).json({
        status: "success",
        message: "Code sent successfully",
        accountID: newAccount._id,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ status: "error", message: "Server error" });
    }
  }
  async updateAccountByAdmin(req, res) {
    try {
      const { accountId } = req.params;

      const { role, status } = req.body;

      const updateFields = {};

      if (role) updateFields.role = role;
      if (status) updateFields.status = status;

      // Nếu không có trường nào được gửi, trả về lỗi
      if (Object.keys(updateFields).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      // Tìm và cập nhật thông tin tài khoản
      const updatedAccount = await Account.findByIdAndUpdate(
        accountId,
        {
          $set: updateFields,
        },
        { new: true }
      );

      if (!updatedAccount) {
        return res.status(404).json({ message: "Account not found" });
      }

      res.status(200).json({
        message: "Account updated successfully",
        account: updatedAccount,
      });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  }
  async getAccountsByAdmin(req, res) {
    try {
      const accounts = await Account.find();

      if (accounts.length === 0) {
        return res.status(404).json({ message: "No accounts found" });
      }

      res.status(200).json({
        message: "Accounts retrieved successfully",
        accounts: accounts,
      });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  }
  async getAccountById(req, res) {
    const accountId = req.params.id;
    try {
      const account = await Account.findById(accountId);

      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      return res.status(200).json(account);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Server error" });
    }
  }
  async updateAccountInfo(req, res) {
    try {
      const accountUpdate = req.body;

      const account = await Account.findById(req.accountID);
      if (!account) {
        return res.status(404).json({ message: "Tài khoản không tồn tại" });
      }

      account.fullName = accountUpdate.fullName;
      account.email = accountUpdate.email;
      account.phoneNumber = accountUpdate.phoneNumber;
      account.address.province = accountUpdate.address.province;
      account.address.district = accountUpdate.address.district;
      account.address.ward = accountUpdate.address.ward;
      account.address.specificAddress = accountUpdate.address.specificAddress;

      await account.save();

      return res.status(200).json({
        message: "Cập nhật thành công!",
        updatedAccount: account,
      });
    } catch (error) {
      console.error("Lỗi cập nhật tài khoản:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }
}

module.exports = new AccountController();
