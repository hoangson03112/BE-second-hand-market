const Account = require("../models/Account");
const config = require("../config/app.config");

const GenerateToken = require("../utils/GenerateToken");
const GenerateRefreshToken = require("../utils/GenerateRefreshToken");
const bcrypt = require("bcrypt");

const {
  generateVerificationCode,
  sendVerificationEmail,
} = require("../utils/verifiEmail");
const Seller = require("../models/Seller");

class AccountController {
  async changePassword(req, res) {
    try {
      const { oldPassword, newPassword } = req.body;
      const account = await Account.findById(req.accountID);
      if (!account) {
        return res.status(404).json({ message: "Tài khoản không tồn tại" });
      }
      // Tài khoản Google đăng nhập qua OAuth, không đổi mật khẩu tại đây
      if (account.googleId) {
        return res.status(400).json({
          message: "Tài khoản Google không thể đổi mật khẩu tại đây. Bạn đăng nhập qua Google.",
        });
      }
      if (!account.password) {
        return res.status(400).json({
          message: "Tài khoản chưa có mật khẩu. Vui lòng đặt mật khẩu trước.",
        });
      }
      const isMatch = await bcrypt.compare(oldPassword, account.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Mật khẩu cũ không đúng" });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      account.password = hashedPassword;
      await account.save();
      return res.status(200).json({ message: "Đổi mật khẩu thành công" });
    } catch (error) {
      console.error("Lỗi đổi mật khẩu:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

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
            message: "Sai tên đăng nhập hoặc mật khẩu",
          });
        }
        if (account.status === "active") {
          const accessToken = GenerateToken(account._id);
          const refreshToken = GenerateRefreshToken(account._id);

          // Lưu refreshToken vào database
          account.refreshToken = refreshToken;
          account.refreshTokenExpires = new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          ); // 7 days - sliding expiration
          account.refreshTokenAbsoluteExpires = new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ); // 30 days - absolute expiration (không được reset)
          account.lastLogin = new Date();
          await account.save();

          // Set refreshToken vào HttpOnly cookie (KHÔNG trả về trong body)
          res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: "/",
          });

          // Chỉ trả về accessToken trong body
          return res.json({
            status: "success",
            message: "Login successful",
            token: accessToken,
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
          message: "Sai tên đăng nhập hoặc mật khẩu",
        });
      }
    } catch (error) {
      return res.status(500).json({ status: "error", message: "Server error" });
    }
  }

  async GoogleCallback(req, res) {
    try {
      const account = req.user;
      if (!account) {
        return res.redirect(
          `${config.frontendUrl}/login?error=google_no_user`
        );
      }
      if (account.status !== "active") {
        account.status = "active";
        await account.save();
      }
      const accessToken = GenerateToken(account._id);
      const refreshToken = GenerateRefreshToken(account._id);
      account.refreshToken = refreshToken;
      account.refreshTokenExpires = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      );
      account.refreshTokenAbsoluteExpires = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      );
      account.lastLogin = new Date();
      await account.save();
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });
      const frontendLogin = `${config.frontendUrl}/login`;
      const redirectUrl = `${frontendLogin}?token=${accessToken}`;
      return res.redirect(redirectUrl);
    } catch (error) {
      console.error("Google callback error:", error);
      return res.redirect(
        `${config.frontendUrl}/login?error=google_failed`
      );
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
            provider: account.googleId ? "google" : "local",
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
    try {
      const account = await Account.findOne({ _id: req.body.userID });

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
        account.verificationCode = undefined;
        account.codeExpires = undefined;

        // Generate both access token and refresh token
        const accessToken = GenerateToken(account._id);
        const refreshToken = GenerateRefreshToken(account._id);

        // Lưu refreshToken vào database
        account.refreshToken = refreshToken;
        account.refreshTokenExpires = new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ); // 7 days - sliding expiration
        account.refreshTokenAbsoluteExpires = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ); // 30 days - absolute expiration (không được reset)
        account.lastLogin = new Date();
        await account.save();

        // Set refreshToken vào HttpOnly cookie (KHÔNG trả về trong body)
        res.cookie("refreshToken", refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          path: "/",
        });

        // Chỉ trả về accessToken trong body
        return res.status(200).json({
          status: "success",
          message: "Account successfully verified",
          token: accessToken,
        });
      } else {
        return res.status(400).json({
          status: "error",
          message: "Invalid or expired verification code",
        });
      }
    } catch (error) {
      console.error("Error in Verify:", error);
      return res.status(500).json({
        status: "error",
        message: "Server error",
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
      const accounts = await Account.find({ role: "buyer" });

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
      const account = await Account.findById(accountId).lean();
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      if (account.role === "seller") {
        const seller = await Seller.findOne({ accountId: accountId })
          .select("province from_ward_code from_district_id businessAddress")
          .lean();

        return res.status(200).json({
          ...account,
          province: seller.province,
          from_ward_code: seller.from_ward_code,
          from_district_id: seller.from_district_id,
          businessAddress: seller.businessAddress,
        });
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
      account.phoneNumber = accountUpdate.phoneNumber;
      // Tài khoản Google: email từ Google, không cho sửa tại đây
      if (!account.googleId) {
        account.email = accountUpdate.email;
      }

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

  async RefreshToken(req, res) {
    try {
      const account = await Account.findById(req.accountID);

      if (!account) {
        return res.status(404).json({
          success: false,
          message: "Tài khoản không tồn tại",
        });
      }

      if (account.status !== "active") {
        return res.status(403).json({
          success: false,
          message: "Tài khoản không hoạt động",
        });
      }

      // ⚠️ KIỂM TRA ABSOLUTE EXPIRATION - Thời hạn tuyệt đối
      if (
        account.refreshTokenAbsoluteExpires &&
        new Date() > account.refreshTokenAbsoluteExpires
      ) {
        // Xóa refresh token khi hết hạn tuyệt đối
        account.refreshToken = undefined;
        account.refreshTokenExpires = undefined;
        account.refreshTokenAbsoluteExpires = undefined;
        await account.save();

        return res.status(401).json({
          success: false,
          message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
          code: "ABSOLUTE_EXPIRATION",
        });
      }

      // Tạo access token mới
      const newAccessToken = GenerateToken(account._id);

      // Tạo refreshToken mới (rotate refresh token để bảo mật hơn)
      const newRefreshToken = GenerateRefreshToken(account._id);

      // Cập nhật refreshToken mới vào database
      account.refreshToken = newRefreshToken;
      account.refreshTokenExpires = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ); // 7 days - sliding expiration (được reset mỗi lần refresh)
      // ⚠️ KHÔNG RESET refreshTokenAbsoluteExpires - giữ nguyên thời hạn tuyệt đối
      await account.save();

      // Set refreshToken mới vào HttpOnly cookie
      res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/",
      });

      // Chỉ trả về accessToken trong body
      return res.status(200).json({
        success: true,
        message: "Token refreshed successfully",
        token: newAccessToken,
      });
    } catch (error) {
      console.error("Lỗi refresh token:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi server",
      });
    }
  }

  async Logout(req, res) {
    try {
      // Xóa refreshToken khỏi database
      if (req.accountID) {
        const account = await Account.findById(req.accountID);
        if (account) {
          account.refreshToken = undefined;
          account.refreshTokenExpires = undefined;
          account.refreshTokenAbsoluteExpires = undefined;
          await account.save();
        }
      }

      // Clear refresh token cookie
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });

      return res.status(200).json({
        success: true,
        message: "Đăng xuất thành công",
      });
    } catch (error) {
      console.error("Lỗi logout:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi server",
      });
    }
  }
}

module.exports = new AccountController();
