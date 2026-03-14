const Account = require("../../models/Account");
const config = require("../../config/env");
const Address = require("../../models/Address");

const GenerateToken = require("../../utils/GenerateToken");
const GenerateRefreshToken = require("../../utils/GenerateRefreshToken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { MESSAGES } = require("../../utils/messages");

const {
  generateVerificationCode,
  sendVerificationEmail,
  sendPasswordChangedEmail,
  sendResetPasswordEmail,
  sendAccountChangeEmail,
} = require("../../services/email.service");
const Seller = require("../../models/Seller");

class AccountController {
  async changePassword(req, res) {
    try {
      const { oldPassword, newPassword } = req.body;
      const account = await Account.findById(req.accountID);
      if (!account) {
        return res.status(404).json({ message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND });
      }
      // Tài khoản Google đăng nhập qua OAuth, không đổi mật khẩu tại đây
      if (account.googleId) {
        return res.status(400).json({
          message: MESSAGES.AUTH.GOOGLE_CANNOT_CHANGE_PASSWORD,
        });
      }
      if (!account.password) {
        return res.status(400).json({
          message: MESSAGES.AUTH.NO_PASSWORD_SET,
        });
      }
      const isMatch = await bcrypt.compare(oldPassword, account.password);
      if (!isMatch) {
        return res.status(400).json({ message: MESSAGES.AUTH.OLD_PASSWORD_WRONG });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      account.password = hashedPassword;
      await account.save();
      
      // Gửi email xác nhận đổi mật khẩu
      try {
        await sendPasswordChangedEmail(account.email, account.fullName);
      } catch (emailError) {
        console.error("Lỗi gửi email:", emailError);
        // Không block response nếu email fail
      }
      
      return res.status(200).json({ message: MESSAGES.AUTH.CHANGE_PASSWORD_SUCCESS });
    } catch (error) {
      return res.status(500).json({ message: MESSAGES.SERVER_ERROR });
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
            message: MESSAGES.AUTH.WRONG_CREDENTIALS,
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
            message: MESSAGES.AUTH.LOGIN_SUCCESS,
            token: accessToken,
          });
        }
        if (account.status === "inactive") {
          return res.json({
            status: "inactive",
            message: MESSAGES.AUTH.ACCOUNT_NOT_ACTIVATED,
          });
        }
        if (account.status === "banned") {
          return res.json({
            status: "banned",
            message: MESSAGES.AUTH.ACCOUNT_BANNED,
          });
        }
      } else {
        return res.json({
          status: "login",
          message: MESSAGES.AUTH.WRONG_CREDENTIALS,
        });
      }
    } catch (error) {
      return res.status(500).json({ status: "error", message: MESSAGES.SERVER_ERROR });
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
      if (account.status === "banned") {
        return res.redirect(
          `${config.frontendUrl}/login?error=account_banned`
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
        message: MESSAGES.AUTH.REGISTER_CODE_SENT,
        accountID: newAccount._id,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ status: "error", message: MESSAGES.SERVER_ERROR });
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
          .json({ status: "error", message: MESSAGES.SERVER_ERROR });
      }
    }
  }
  async Verify(req, res) {
    try {
      const account = await Account.findOne({ _id: req.body.userID });

      if (!account) {
        return res.status(404).json({
          status: "error",
          message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND,
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
          message: MESSAGES.AUTH.VERIFY_SUCCESS,
          token: accessToken,
        });
      } else {
        return res.status(400).json({
          status: "error",
          message: MESSAGES.AUTH.VERIFY_INVALID_CODE,
        });
      }
    } catch (error) {
      console.error("Error in Verify:", error);
      return res.status(500).json({
        status: "error",
        message: MESSAGES.SERVER_ERROR,
      });
    }
  }
  async getAccountsByAdmin(req, res) {
    try {
      const { page = 1, limit = 20, search, status } = req.query;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const skip = (pageNum - 1) * limitNum;

      const query = { role: "buyer" };
      if (status && ["active", "inactive", "banned"].includes(status)) {
        query.status = status;
      }
      if (search && search.trim()) {
        const re = { $regex: search.trim(), $options: "i" };
        query.$or = [{ fullName: re }, { email: re }, { phoneNumber: re }];
      }

      const [accounts, total] = await Promise.all([
        Account.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
        Account.countDocuments(query),
      ]);

      res.status(200).json({
        message: MESSAGES.AUTH.ACCOUNTS_RETRIEVED,
        accounts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalItems: total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      res.status(500).json({ message: MESSAGES.SERVER_ERROR });
    }
  }

  async updateAccountStatusByAdmin(req, res) {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;

      if (!["active", "banned"].includes(status)) {
        return res.status(400).json({
          message: "Trạng thái phải là 'active' hoặc 'banned'",
        });
      }

      const account = await Account.findById(id);
      if (!account) {
        return res.status(404).json({ message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND });
      }

      if (account.role === "admin") {
        return res.status(403).json({
          message: "Không thể khóa tài khoản quản trị viên",
        });
      }

      account.status = status;
      await account.save();

      res.status(200).json({
        message: status === "banned" ? "Đã khóa tài khoản" : "Đã mở khóa tài khoản",
        account,
      });
    } catch (error) {
      res.status(500).json({ message: MESSAGES.SERVER_ERROR });
    }
  }
  async getAccountById(req, res) {
    const accountId = req.params.id;
    try {
      const account = await Account.findById(accountId).lean();
      if (!account) {
        return res.status(404).json({ message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND });
      }

      if (account.role === "seller") {
        const [seller, pickupAddr] = await Promise.all([
          Seller.findOne({ accountId: accountId })
            .select("province from_ward_code from_district_id businessAddress")
            .lean(),
          Address.findOne({ accountId: accountId, type: "pickup" }).lean(),
        ]);

        const addr = pickupAddr || seller;
        return res.status(200).json({
          ...account,
          province: seller?.province,
          from_ward_code: addr?.wardCode ?? addr?.from_ward_code,
          from_district_id: addr?.districtId ?? addr?.from_district_id,
          businessAddress: addr?.specificAddress ?? addr?.businessAddress,
        });
      }

      return res.status(200).json(account);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: MESSAGES.SERVER_ERROR });
    }
  }
  async updateAccountInfo(req, res) {
    try {
      const accountUpdate = req.body;

      const account = await Account.findById(req.accountID);
      if (!account) {
        return res.status(404).json({ message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND });
      }

      // Track changes for email notification
      const oldEmail = account.email;
      const oldPhoneNumber = account.phoneNumber;
      let emailChanged = false;
      let phoneChanged = false;

      account.fullName = accountUpdate.fullName;
      
      // Update phone number
      if (accountUpdate.phoneNumber !== oldPhoneNumber) {
        phoneChanged = true;
        account.phoneNumber = accountUpdate.phoneNumber;
      }
      
      // Tài khoản Google: email từ Google, không cho sửa tại đây
      if (!account.googleId) {
        if (accountUpdate.email !== oldEmail) {
          emailChanged = true;
          account.email = accountUpdate.email;
        }
      }

      await account.save();

      // Send confirmation emails asynchronously
      if (emailChanged) {
        try {
          await sendAccountChangeEmail(
            accountUpdate.email,
            account.fullName,
            'email',
            accountUpdate.email
          );
        } catch (emailError) {
          console.error("Lỗi gửi email xác nhận thay đổi email:", emailError);
        }
      }

      if (phoneChanged) {
        try {
          await sendAccountChangeEmail(
            account.email,
            account.fullName,
            'phoneNumber',
            accountUpdate.phoneNumber
          );
        } catch (emailError) {
          console.error("Lỗi gửi email xác nhận thay đổi SĐT:", emailError);
        }
      }

      return res.status(200).json({
        message: MESSAGES.AUTH.UPDATE_SUCCESS,
        updatedAccount: account,
      });
    } catch (error) {
      console.error("Lỗi cập nhật tài khoản:", error);
      return res.status(500).json({ message: MESSAGES.SERVER_ERROR });
    }
  }

  async RefreshToken(req, res) {
    try {
      const account = await Account.findById(req.accountID);

      if (!account) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND,
        });
      }

      if (account.status !== "active") {
        return res.status(403).json({
          success: false,
          message: MESSAGES.AUTH.ACCOUNT_INACTIVE,
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
          message: MESSAGES.AUTH.SESSION_EXPIRED,
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
      // ⚠️ KHÔNG RESET refreshTokenAbsoluteExpires - giữ nguyên thỜi hạn tuyệt đối

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
        message: MESSAGES.AUTH.TOKEN_REFRESHED,
        token: newAccessToken,
      });
    } catch (error) {
      console.error("Lỗi refresh token:", error);
      return res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
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
        message: MESSAGES.AUTH.LOGOUT_SUCCESS,
      });
    } catch (error) {
      console.error("Lỗi logout:", error);
      return res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
      });
    }
  }

  // 2️⒣ Forgot Password - Gửi link reset qua email
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: MESSAGES.AUTH.ENTER_EMAIL });
      }

      const account = await Account.findOne({ email });
      
      if (!account) {
        // Không tiết lộ thông tin tài khoản tồn tại hay không (bảo mật)
        return res.status(200).json({ 
          message: MESSAGES.AUTH.FORGOT_PASSWORD_EMAIL_SENT 
        });
      }

      // Tài khoản Google không reset mật khẩu
      if (account.googleId) {
        return res.status(400).json({
          message: MESSAGES.AUTH.GOOGLE_RESET_UNSUPPORTED,
        });
      }

      // Tạo reset token (random string)
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = await bcrypt.hash(resetToken, 10);

      // Lưu token vào DB với thời gian hết hạn
      account.resetPasswordToken = resetTokenHash;
      account.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 phút
      await account.save();

      // Gửi email
      try {
        await sendResetPasswordEmail(account.email, resetToken, account.fullName);
      } catch (emailError) {
        console.error("Lỗi gửi email reset password:", emailError);
        return res.status(500).json({ 
          message: MESSAGES.AUTH.SEND_EMAIL_FAILED 
        });
      }

      return res.status(200).json({
        message: MESSAGES.AUTH.RESET_LINK_SENT,
      });
    } catch (error) {
      console.error("Lỗi forgot password:", error);
      return res.status(500).json({ message: MESSAGES.SERVER_ERROR });
    }
  }

  // 3️⃣ Reset Password - Đổi mật khẩu với token
  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ 
          message: MESSAGES.AUTH.MISSING_RESET_INFO 
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ 
          message: MESSAGES.AUTH.PASSWORD_TOO_SHORT 
        });
      }

      // Tìm tài khoản có token chưa hết hạn
      const accounts = await Account.find({
        resetPasswordToken: { $exists: true },
        resetPasswordExpires: { $gt: Date.now() },
      });

      let matchedAccount = null;
      
      // KiỒm tra token hash
      for (const account of accounts) {
        const isMatch = await bcrypt.compare(token, account.resetPasswordToken);
        if (isMatch) {
          matchedAccount = account;
          break;
        }
      }

      if (!matchedAccount) {
        return res.status(400).json({
          message: MESSAGES.AUTH.RESET_TOKEN_INVALID,
        });
      }

      // Đổi mật khẩu
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      matchedAccount.password = hashedPassword;
      matchedAccount.resetPasswordToken = undefined;
      matchedAccount.resetPasswordExpires = undefined;
      await matchedAccount.save();

      // Gửi email xác nhận đổi mật khẩu
      try {
        await sendPasswordChangedEmail(matchedAccount.email, matchedAccount.fullName);
      } catch (emailError) {
        console.error("Lỗi gửi email xác nhận:", emailError);
      }

      return res.status(200).json({
        message: MESSAGES.AUTH.RESET_PASSWORD_SUCCESS,
      });
    } catch (error) {
      console.error("Lỗi reset password:", error);
      return res.status(500).json({ message: MESSAGES.SERVER_ERROR });
    }
  }
}

module.exports = new AccountController();

