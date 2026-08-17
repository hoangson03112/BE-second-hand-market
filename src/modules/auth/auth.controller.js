const mongoose = require("mongoose");
const Account = require("../../models/Account");
const config = require("../../config/env");

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { MESSAGES } = require("../../utils/messages");

const {
  generateVerificationCode,
  sendVerificationEmail,
  sendPasswordChangedEmail,
  sendResetPasswordEmail,
  sendAccountBannedEmail,
  sendAccountUnbannedEmail,
  sendAppealReceivedToUserEmail,
} = require("../../services/email.service");
const Report = require("../../models/Report");
const { saveAndEmitNotification } = require("../../utils/notification");

function generatePendingGoogleVerifyToken(accountId) {
  return jwt.sign(
    { _id: accountId, purpose: "google_email_verify" },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "10m" },
  );
}
const Seller = require("../../models/Seller");
const Product = require("../../models/Product");
const { logAdminAction } = require("../../services/adminAuditLog.service");
const { clearAuthCookies } = require("../../utils/cookieHelper");
const { issueSession, revokeSession } = require("../../services/token.service");

const MAX_LOGIN_ATTEMPTS = 8;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const VERIFICATION_CODE_TTL_MINUTES = 10;
const VERIFICATION_CODE_TTL_MS = VERIFICATION_CODE_TTL_MINUTES * 60 * 1000;

const RESEND_COOLDOWN_SECONDS = 60;
const RESEND_COOLDOWN_MS = RESEND_COOLDOWN_SECONDS * 1000;

const MAX_VERIFY_ATTEMPTS = 5;

function verifiableStatusError(account) {
  if (account.status === "inactive") return null;
  return account.status === "banned"
    ? "Tài khoản đã bị khoá. Vui lòng liên hệ hỗ trợ."
    : "Tài khoản đã được xác thực. Bạn có thể đăng nhập ngay.";
}

class AuthController {
  async changePassword(req, res) {  
    try {
      const { oldPassword, newPassword } = req.body;
      const account = await Account.findById(req.accountID);
      if (!account) {
        return res
          .status(404)
          .json({ message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND });
      }

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
        return res
          .status(400)
          .json({ message: MESSAGES.AUTH.OLD_PASSWORD_WRONG });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      account.password = hashedPassword;
      await account.save();

      await revokeSession(account);
      clearAuthCookies(res);

      try {
        await sendPasswordChangedEmail(account.email, account.fullName);
      } catch (emailError) {
        console.error("Lỗi gửi email:", emailError);
      }

      return res
        .status(200)
        .json({ message: MESSAGES.AUTH.CHANGE_PASSWORD_SUCCESS });
    } catch (error) {
      return res.status(500).json({ message: MESSAGES.SERVER_ERROR });
    }
  }

  async setPassword(req, res) {
    try {
      const { newPassword } = req.body;
      const account = await Account.findById(req.accountID);
      if (!account) {
        return res
          .status(404)
          .json({ message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND });
      }
      if (!account.googleId) {
        return res.status(400).json({
          message: "Tài khoản đã có mật khẩu. Vui lòng dùng Đổi mật khẩu.",
        });
      }
      if (
        !newPassword ||
        typeof newPassword !== "string" ||
        newPassword.length < 6
      ) {
        return res.status(400).json({
          message: "Mật khẩu mới tối thiểu 6 ký tự.",
        });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      account.password = hashedPassword;
      await account.save();

      // Vừa đặt mật khẩu ⇒ thu hồi phiên cũ, buộc đăng nhập lại bằng mật khẩu.
      await revokeSession(account);
      clearAuthCookies(res);

      try {
        await sendPasswordChangedEmail(account.email, account.fullName);
      } catch (emailError) {
        console.error("Lỗi gửi email:", emailError);
      }

      return res
        .status(200)
        .json({ message: MESSAGES.AUTH.SET_PASSWORD_SUCCESS });
    } catch (error) {
      console.error("setPassword error:", error);
      return res.status(500).json({
        message: MESSAGES.AUTH.SET_PASSWORD_ERROR,
      });
    }
  }

  async login(req, res) {
    try {
      const data = req.body || {};
      const identifier = String(data.username || data.email || "").trim();
      const password = String(data.password || "");

      if (!identifier || !password) {
        return res.status(400).json({
          status: "error",
          type: "missing_fields",
          message: "Vui lòng nhập đầy đủ thông tin đăng nhập.",
        });
      }

      const account = await Account.findOne({
        $or: [{ username: identifier }, { email: identifier.toLowerCase() }],
      });

      if (!account || !account.password) {
        return res.status(401).json({
          status: "error",
          type: "credentials",
          message: "Email/Tên đăng nhập hoặc mật khẩu không chính xác.",
        });
      }
      if (account.lockUntil && account.lockUntil > new Date()) {
        const minutes = Math.ceil((account.lockUntil - Date.now()) / 60000);
        return res.status(429).json({
          status: "error",
          type: "locked",
          message: `Tài khoản tạm khoá do đăng nhập sai nhiều lần. Vui lòng thử lại sau ${minutes} phút.`,
        });
      }

      // check pas
      const isMatch = await bcrypt.compare(password, account.password);
      if (!isMatch) {
        account.loginAttempts = (account.loginAttempts || 0) + 1;
        if (account.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
          account.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
          account.loginAttempts = 0;
        }
        await account.save();

        return res.status(401).json({
          status: "error",
          type: "credentials",
          message: "Email/Tên đăng nhập hoặc mật khẩu không chính xác.",
        });
      }

      if (account.status === "inactive") {
        return res.status(403).json({
          status: "error",
          type: "inactive",
          message: "Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email.",
        });
      }

      if (account.status === "banned") {
        return res.status(403).json({
          status: "error",
          type: "banned",
          message: "Tài khoản của bạn đã bị khóa.",
        });
      }

      await issueSession(res, account);

      return res.status(200).json({
        status: "success",
        message: "Đăng nhập thành công.",
      });
    } catch (error) {
      console.error("Login Error:", error); // Log lỗi để debug
      return res.status(500).json({
        status: "error",
        message: "Lỗi máy chủ nội bộ. Vui lòng thử lại sau.",
      });
    }
  }

  async googleCallback(req, res) {
    try {
      const account = req.user;
      if (!account) {
        return res.redirect(`${config.frontendUrl}/login?error=google_no_user`);
      }
      if (account.status === "banned") {
        return res.redirect(`${config.frontendUrl}/login?error=account_banned`);
      }
      if (account.status !== "active") {
        account.status = "active";
        await account.save();
      }
      if (account.lastLogin) {
        await issueSession(res, account);
        return res.redirect(`${config.frontendUrl}/auth/callback`);
      }

  
      const verificationCode = generateVerificationCode();
      account.verificationCode = verificationCode;
      account.codeExpires = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
      account.verificationCodeSentAt = new Date();
      account.verificationAttempts = 0;
      await account.save();

      await sendVerificationEmail(
        account.email,  
        verificationCode,
        VERIFICATION_CODE_TTL_MINUTES,
      );
      const pendingToken = generatePendingGoogleVerifyToken(
        account._id.toString(),
      );
      const verifyUrl = `${config.frontendUrl}/verify-google-email?pending=${encodeURIComponent(pendingToken)}&email=${encodeURIComponent(account.email)}`;
      return res.redirect(verifyUrl);
    } catch (error) {
      console.error("Google callback error:", error);
      return res.redirect(`${config.frontendUrl}/login?error=google_failed`);
    }
  }

  async verifyGoogleEmail(req, res) {
    try {
      const { pending, code } = req.body;
      if (!pending || !code || typeof code !== "string") {
        return res.status(400).json({
          status: "error",
          message: "Thiếu mã xác minh hoặc phiên không hợp lệ.",
        });
      }
      let decoded;
      try {
        decoded = jwt.verify(pending, process.env.JWT_ACCESS_SECRET);
      } catch {
        return res.status(400).json({
          status: "error",
          message:
            "Phiên xác minh hết hạn. Vui lòng đăng nhập lại bằng Google.",
        });
      }
      if (decoded.purpose !== "google_email_verify" || !decoded._id) {
        return res.status(400).json({
          status: "error",
          message: "Phiên không hợp lệ.",
        });
      }
      const account = await Account.findById(decoded._id);
      if (!account) {
        return res.status(404).json({
          status: "error",
          message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND,
        });
      }
      if (
        !account.verificationCode ||
        account.verificationCode !== code.trim()
      ) {
        return res.status(400).json({
          status: "error",
          message: "Mã xác minh không đúng.",
        });
      }
      if (!account.codeExpires || new Date(account.codeExpires) < new Date()) {
        return res.status(400).json({
          status: "error",
          message:
            "Mã xác minh đã hết hạn. Vui lòng đăng nhập lại bằng Google.",
        });
      }
      account.verificationCode = undefined;
      account.codeExpires = undefined;
      await issueSession(res, account);

      return res.status(200).json({
        status: "success",
        message: MESSAGES.AUTH.LOGIN_SUCCESS,
      });
    } catch (error) {
      console.error("verifyGoogleEmail error:", error);
      return res
        .status(500)
        .json({ status: "error", message: MESSAGES.SERVER_ERROR });
    }
  }

  async resendGoogleEmailCode(req, res) {
    try {
      const { pending } = req.body;
      if (!pending || typeof pending !== "string") {
        return res.status(400).json({
          status: "error",
          message: "Thiếu phiên xác minh hợp lệ.",
        });
      }

      let decoded;
      try {
        decoded = jwt.verify(pending, process.env.JWT_ACCESS_SECRET);
      } catch {
        return res.status(400).json({
          status: "error",
          message:
            "Phiên xác minh đã hết hạn. Vui lòng đăng nhập lại bằng Google.",
        });
      }

      if (decoded.purpose !== "google_email_verify" || !decoded._id) {
        return res.status(400).json({
          status: "error",
          message: "Phiên xác minh không hợp lệ.",
        });
      }

      const account = await Account.findById(decoded._id);
      if (!account) {
        return res.status(404).json({
          status: "error",
          message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND,
        });
      }

      // Cùng cooldown theo tài khoản như luồng đăng ký thường.
      const lastSent = account.verificationCodeSentAt
        ? new Date(account.verificationCodeSentAt).getTime()
        : 0;
      const elapsed = Date.now() - lastSent;

      if (elapsed < RESEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil(
          (RESEND_COOLDOWN_MS - elapsed) / 1000,
        );
        return res.status(429).json({
          status: "error",
          code: "COOLDOWN",
          retryAfterSeconds,
          message: `Vui lòng đợi ${retryAfterSeconds} giây trước khi gửi lại mã.`,
        });
      }

      const verificationCode = generateVerificationCode();
      account.verificationCode = verificationCode;
      account.codeExpires = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
      account.verificationCodeSentAt = new Date();
      account.verificationAttempts = 0;
      await account.save();

      await sendVerificationEmail(
        account.email,
        verificationCode,
        VERIFICATION_CODE_TTL_MINUTES,
      );

      return res.status(200).json({
        status: "success",
        message:
          "Đã gửi lại mã xác minh. Vui lòng kiểm tra hộp thư (kể cả Spam).",
        retryAfterSeconds: RESEND_COOLDOWN_SECONDS,
        expiresInMinutes: VERIFICATION_CODE_TTL_MINUTES,
      });
    } catch (error) {
      console.error("resendGoogleEmailCode error:", error);
      return res
        .status(500)
        .json({ status: "error", message: MESSAGES.SERVER_ERROR });
    }
  }

  async register(req, res) {
    try {
      const data = req.body || {};
      const username =
        typeof data.username === "string" ? data.username.trim() : "";
      const email =
        typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
      const password = typeof data.password === "string" ? data.password : "";
      const phoneNumber =
        typeof data.phoneNumber === "string" ? data.phoneNumber.trim() : "";

      if (!email || !password) {
        return res.status(400).json({
          status: "error",
          type: "missing_fields",
          message: MESSAGES.MISSING_FIELDS,
        });
      }

      let resolvedUsername = username;
      if (!resolvedUsername) {
        const base =
          (email.split("@")[0] || "user")
            .replace(/[^a-zA-Z0-9_.-]/g, "")
            .slice(0, 20) || "user";
        resolvedUsername = base;
        let suffix = 0;
        while (await Account.findOne({ username: resolvedUsername })) {
          suffix += 1;
          resolvedUsername = `${base}_${suffix}`;
        }
      }

      const [existingUsername, existingEmail, existingPhone] =
        await Promise.all([
          Account.findOne({ username: resolvedUsername }),
          Account.findOne({ email }),
          phoneNumber
            ? Account.findOne({ phoneNumber })
            : Promise.resolve(null),
        ]);

      if (existingUsername) {
        return res.status(400).json({ status: "error", type: "username" });
      }

      if (existingEmail) {
        return res.status(400).json({ status: "error", type: "email" });
      }

      if (existingPhone) {
        return res.status(400).json({ status: "error", type: "phoneNumber" });
      }

      const verificationCode = generateVerificationCode();
      await sendVerificationEmail(
        email,
        verificationCode,
        VERIFICATION_CODE_TTL_MINUTES,
      );
      const hashedPassword = await bcrypt.hash(password, 10);
      const newAccount = new Account({
        ...data,
        username: resolvedUsername,
        email,
        phoneNumber: phoneNumber || undefined,
        password: hashedPassword,
      });
      await newAccount.save();

      await Account.updateOne(
        { _id: newAccount._id },
        {
          verificationCode,
          codeExpires: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
          verificationCodeSentAt: new Date(),
          verificationAttempts: 0,
        },
      );

      return res.status(200).json({
        status: "success",
        message: MESSAGES.AUTH.REGISTER_CODE_SENT,
        accountID: newAccount._id,
      });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ status: "error", message: MESSAGES.SERVER_ERROR });
    }
  }

  async me(req, res) {
    try {
      const account = await Account.findById(req.accountID);

      if (!account) {
        clearAuthCookies(res);
        return res.status(401).json({
          status: "error",
          message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND,
        });
      }

      return res.json({
        status: "success",
        account: {
          accountID: account._id,
          fullName: account.fullName,
          avatar: account.avatar,
          role: account.role,
          email: account.email,
          phoneNumber: account.phoneNumber,
          createdAt: account.createdAt,
          addresses: account.addresses,
          provider: account.googleId ? "google" : "local",
        },
      });
    } catch (error) {
      console.error("me error:", error);
      return res
        .status(500)
        .json({ status: "error", message: MESSAGES.SERVER_ERROR });
    }
  }
  async verify(req, res) {
    try {
      const { userID, code } = req.body;

      if (!mongoose.isValidObjectId(userID)) {
        return res.status(400).json({
          status: "error",
          message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND,
        });
      }

      const account = await Account.findById(userID);

      if (!account) {
        return res.status(404).json({
          status: "error",
          message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND,
        });
      }

      // Không chặn ở đây thì một tài khoản bị khoá mà còn mã chưa dùng sẽ tự
      // được gỡ khoá khi nhập đúng mã, vì bên dưới gán thẳng status = "active".
      const statusError = verifiableStatusError(account);
      if (statusError) {
        return res.status(400).json({ status: "error", message: statusError });
      }

      const expired =
        !account.verificationCode ||
        !account.codeExpires ||
        Date.now() >= new Date(account.codeExpires).getTime();

      if (expired) {
        return res.status(400).json({
          status: "error",
          code: "CODE_EXPIRED",
          message: "Mã xác thực đã hết hạn. Vui lòng bấm gửi lại mã.",
        });
      }

      if (account.verificationCode !== String(code ?? "").trim()) {
        account.verificationAttempts = (account.verificationAttempts || 0) + 1;
        const exhausted = account.verificationAttempts >= MAX_VERIFY_ATTEMPTS;

        if (exhausted) {
          // Vô hiệu mã thay vì khoá tài khoản: người dùng thật chỉ cần xin mã
          // mới, còn kẻ dò mã mất toàn bộ tiến trình đã đoán.
          account.verificationCode = undefined;
          account.codeExpires = undefined;
          account.verificationAttempts = 0;
        }
        await account.save();

        return res.status(400).json({
          status: "error",
          code: exhausted ? "ATTEMPTS_EXCEEDED" : "INVALID_CODE",
          attemptsLeft: exhausted
            ? 0
            : MAX_VERIFY_ATTEMPTS - account.verificationAttempts,
          message: exhausted
            ? "Bạn đã nhập sai quá nhiều lần. Mã đã bị vô hiệu, vui lòng bấm gửi lại mã."
            : MESSAGES.AUTH.VERIFY_INVALID_CODE,
        });
      }

      account.status = "active";
      account.verificationCode = undefined;
      account.codeExpires = undefined;
      account.verificationAttempts = 0;

      // issueSession gọi account.save() nên các thay đổi trên được lưu cùng lúc.
      await issueSession(res, account);

      return res.status(200).json({
        status: "success",
        message: MESSAGES.AUTH.VERIFY_SUCCESS,
      });
    } catch (error) {
      console.error("Error in Verify:", error);
      return res.status(500).json({
        status: "error",
        message: MESSAGES.SERVER_ERROR,
      });
    }
  }

  async resendVerificationCode(req, res) {
    try {
      const { accountID } = req.body;

      if (!mongoose.isValidObjectId(accountID)) {
        return res.status(400).json({
          status: "error",
          message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND,
        });
      }

      const account = await Account.findById(accountID);
      if (!account) {
        return res.status(404).json({
          status: "error",
          message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND,
        });
      }

      const statusError = verifiableStatusError(account);
      if (statusError) {
        return res.status(400).json({ status: "error", message: statusError });
      }

      // Cooldown theo tài khoản. Limiter ở route chỉ chặn theo IP nên không
      // ngăn được việc dội mail vào một địa chỉ cụ thể qua nhiều IP.
      const lastSent = account.verificationCodeSentAt
        ? new Date(account.verificationCodeSentAt).getTime()
        : 0;
      const elapsed = Date.now() - lastSent;

      if (elapsed < RESEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil(
          (RESEND_COOLDOWN_MS - elapsed) / 1000,
        );
        return res.status(429).json({
          status: "error",
          code: "COOLDOWN",
          retryAfterSeconds,
          message: `Vui lòng đợi ${retryAfterSeconds} giây trước khi gửi lại mã.`,
        });
      }

      const verificationCode = generateVerificationCode();
      account.verificationCode = verificationCode;
      account.codeExpires = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
      account.verificationCodeSentAt = new Date();
      account.verificationAttempts = 0;
      await account.save();

      try {
        await sendVerificationEmail(
          account.email,
          verificationCode,
          VERIFICATION_CODE_TTL_MINUTES,
        );
      } catch (mailError) {
        // Gỡ mốc cooldown để người dùng thử lại được ngay — mã mới đã lưu
        // nhưng chưa ai nhận được, bắt họ chờ 60 giây là vô nghĩa.
        account.verificationCodeSentAt = undefined;
        await account.save();
        console.error(
          "Lỗi gửi lại mã xác thực:",
          mailError.response?.body || mailError,
        );
        return res.status(502).json({
          status: "error",
          code: "MAIL_FAILED",
          message: "Không gửi được email lúc này. Vui lòng thử lại.",
        });
      }

      return res.status(200).json({
        status: "success",
        message:
          "Đã gửi lại mã xác thực. Vui lòng kiểm tra hộp thư, kể cả Spam.",
        retryAfterSeconds: RESEND_COOLDOWN_SECONDS,
        expiresInMinutes: VERIFICATION_CODE_TTL_MINUTES,
      });
    } catch (error) {
      console.error("Error in resendVerificationCode:", error);
      return res.status(500).json({
        status: "error",
        message: MESSAGES.SERVER_ERROR,
      });
    }
  }
  async getAccountsByAdmin(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        status,
        role,
        startDate,
        endDate,
      } = req.query;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const skip = (pageNum - 1) * limitNum;

      const query = {};
      if (role && ["buyer", "seller", "admin"].includes(role)) {
        query.role = role;
      }
      if (status && ["active", "inactive", "banned"].includes(status)) {
        query.status = status;
      }
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          query.createdAt.$lte = end;
        }
      }
      if (search && search.trim()) {
        const re = { $regex: search.trim(), $options: "i" };
        query.$or = [
          { fullName: re },
          { email: re },
          { phoneNumber: re },
          { username: re },
        ];
      }

      const [accounts, total] = await Promise.all([
        Account.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
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
      let hiddenProductsCount = 0;
      let cancelledOrdersCount = 0;

      if (!["active", "banned"].includes(status)) {
        return res.status(400).json({
          message: "Trạng thái phải là 'active' hoặc 'banned'",
        });
      }

      const account = await Account.findById(id);
      if (!account) {
        return res
          .status(404)
          .json({ message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND });
      }

      if (account.role === "admin") {
        return res.status(403).json({
          message: "Không thể khóa tài khoản quản trị viên",
        });
      }

      account.status = status;
      await account.save();

      if (status === "banned") {
        try {
          const productUpdateResult = await Product.updateMany(
            {
              sellerId: account._id,
              status: { $in: ["approved", "active"] },
            },
            { $set: { status: "inactive" } },
          );
          hiddenProductsCount =
            typeof productUpdateResult?.modifiedCount === "number"
              ? productUpdateResult.modifiedCount
              : 0;
        } catch (e) {
          console.error(
            "Lỗi cập nhật trạng thái sản phẩm khi khóa tài khoản:",
            e.message,
          );
        }

        try {
          const Order = require("../../models/Order");
          const { cancelShippingOrder } = require("../../services/ghn.service");
          const pendingOrders = await Order.find({
            sellerId: account._id,
            status: { $in: ["pending", "confirmed"] },
          }).select("_id status statusHistory ghnOrderCode");
          cancelledOrdersCount = pendingOrders.length;

          const now = new Date();
          const bulkOps = pendingOrders.map((order) => ({
            updateOne: {
              filter: { _id: order._id },
              update: {
                $set: {
                  status: "cancelled",
                  cancelReason:
                    "Đơn hàng bị hủy do tài khoản người bán bị khóa bởi quản trị viên.",
                  cancelledAt: now,
                },
                $push: {
                  statusHistory: {
                    status: "cancelled",
                    updatedAt: now,
                  },
                },
              },
            },
          }));

          if (bulkOps.length > 0) {
            await Order.bulkWrite(bulkOps);
          }

          for (const order of pendingOrders) {
            if (!order.ghnOrderCode) continue;
            try {
              await cancelShippingOrder(order.ghnOrderCode);
            } catch (e) {
              console.error(
                `Lỗi hủy đơn GHN (${order.ghnOrderCode}) khi khóa tài khoản:`,
                e.message,
              );
            }
          }
        } catch (e) {
          console.error(
            "Lỗi tự động hủy đơn chưa giao khi khóa tài khoản:",
            e.message,
          );
        }
      }

      if (status === "active") {
        try {
          const seller = await Seller.findOne({ accountId: account._id })
            .select("verificationStatus")
            .lean();
          if (
            seller?.verificationStatus === "approved" &&
            account.role !== "seller"
          ) {
            account.role = "seller";
            await account.save();
          }
        } catch (e) {
          console.error(
            "Lỗi đồng bộ role seller khi mở khóa account:",
            e.message,
          );
        }
      }

      if (status === "banned") {
        try {
          const io = req.app.get("io");
          if (io) {
            io.to(account._id.toString()).emit("account-banned", {
              message:
                "Tài khoản của bạn đã bị khóa. Bạn không thể thực hiện thao tác. Nếu cho rằng đây là nhầm lẫn, vui lòng gửi khiếu nại đến quản trị viên.",
            });
          }
        } catch (e) {
          console.error("Lỗi emit account-banned socket:", e.message);
        }
      }

      setImmediate(async () => {
        try {
          const toEmail = account.email;
          const userName = account.fullName || "bạn";
          if (status === "banned") {
            await sendAccountBannedEmail(toEmail, userName, reason || null);
          } else {
            await sendAccountUnbannedEmail(toEmail, userName);
          }
        } catch (e) {
          console.error(
            "Lỗi gửi email thông báo trạng thái tài khoản:",
            e.message,
          );
        }
      });

      try {
        await logAdminAction({
          adminId: req.accountID,
          action: status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_UNBANNED",
          targetType: "Account",
          targetId: account._id,
          metadata: {
            accountRole: account.role,
            accountEmail: account.email,
            reason: reason || null,
            hiddenProductsCount,
            cancelledOrdersCount,
          },
          req,
        });
      } catch (e) {
        console.error(
          "Lỗi ghi audit log cập nhật trạng thái account:",
          e.message,
        );
      }

      res.status(200).json({
        message:
          status === "banned" ? "Đã khóa tài khoản" : "Đã mở khóa tài khoản",
        account,
      });
    } catch (error) {
      res.status(500).json({ message: MESSAGES.SERVER_ERROR });
    }
  }

  async refreshToken(req, res) {
    try {
      // verifyRefreshToken đã kiểm tra chữ ký, hash, hạn thường/tuyệt đối,
      // trạng thái banned và phát hiện token bị dùng lại.
      const account = req.account;

      if (account.status !== "active") {
        await revokeSession(account);
        clearAuthCookies(res);
        return res.status(403).json({
          success: false,
          message: MESSAGES.AUTH.ACCOUNT_INACTIVE,
        });
      }

      // Xoay vòng ĐÚNG bản ghi ứng với token đang dùng: cấp cặp mới, giữ token
      // cũ trong cửa sổ ân hạn ngắn, set lại cả accessToken lẫn refreshToken
      // vào cookie. Các lần đăng nhập khác của tài khoản không bị đụng tới.
      await issueSession(res, account, {
        rotate: true,
        jti: req.refreshTokenEntry.jti,
        prevHash: req.refreshTokenEntry.hash,
      });

      return res.status(200).json({
        success: true,
        message: MESSAGES.AUTH.TOKEN_REFRESHED,
      });
    } catch (error) {
      console.error("Lỗi refresh token:", error);
      return res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
      });
    }
  }

  async logout(req, res) {
    try {
      // Đăng xuất phải chạy được cả khi access token đã hết hạn, nên xác định
      // tài khoản từ refresh token thay vì bắt buộc phải còn phiên hợp lệ.
      const refreshToken = req.cookies?.refreshToken;

      if (refreshToken) {
        try {
          const decoded = jwt.verify(
            refreshToken,
            process.env.JWT_REFRESH_SECRET,
          );
          const account = await Account.findById(decoded._id);
          // Chỉ thu hồi ĐÚNG token đang dùng: đăng xuất ở máy này không được
          // đá người dùng ra khỏi các máy khác. Bản sao bị đánh cắp của chính
          // token này cũng hết tác dụng ngay.
          await revokeSession(account, decoded.jti);
        } catch {
          // Token hỏng/hết hạn thì không có gì để thu hồi — vẫn xoá cookie.
        }
      }

      clearAuthCookies(res);

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

  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: MESSAGES.AUTH.ENTER_EMAIL });
      }

      const account = await Account.findOne({ email });

      if (!account) {
        return res.status(200).json({
          message: MESSAGES.AUTH.FORGOT_PASSWORD_EMAIL_SENT,
        });
      }

      if (account.googleId) {
        return res.status(400).json({
          message: MESSAGES.AUTH.GOOGLE_RESET_UNSUPPORTED,
        });
      }

      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenHash = await bcrypt.hash(resetToken, 10);

      account.resetPasswordToken = resetTokenHash;
      account.resetPasswordExpires = Date.now() + 15 * 60 * 1000;
      await account.save();

      try {
        await sendResetPasswordEmail(
          account.email,
          resetToken,
          account.fullName,
        );
      } catch (emailError) {
        console.error("Lỗi gửi email reset password:", emailError);
        return res.status(500).json({
          message: MESSAGES.AUTH.SEND_EMAIL_FAILED,
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

  async validateResetToken(req, res) {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          valid: false,
          message: MESSAGES.AUTH.RESET_TOKEN_INVALID,
        });
      }

      const accounts = await Account.find({
        resetPasswordToken: { $exists: true },
        resetPasswordExpires: { $gt: Date.now() },
      });

      for (const account of accounts) {
        const isMatch = await bcrypt.compare(token, account.resetPasswordToken);
        if (isMatch) {
          return res.status(200).json({
            valid: true,
            message: "Link đặt lại mật khẩu hợp lệ.",
          });
        }
      }

      return res.status(400).json({
        valid: false,
        message: MESSAGES.AUTH.RESET_TOKEN_INVALID,
      });
    } catch (error) {
      console.error("Lỗi validate reset token:", error);
      return res.status(500).json({
        valid: false,
        message: MESSAGES.SERVER_ERROR,
      });
    }
  }

  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({
          message: MESSAGES.AUTH.MISSING_RESET_INFO,
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          message: MESSAGES.AUTH.PASSWORD_TOO_SHORT,
        });
      }

      const accounts = await Account.find({
        resetPasswordToken: { $exists: true },
        resetPasswordExpires: { $gt: Date.now() },
      });

      let matchedAccount = null;

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

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      matchedAccount.password = hashedPassword;
      matchedAccount.resetPasswordToken = undefined;
      matchedAccount.resetPasswordExpires = undefined;

      // Đổi mật khẩu ⇒ thu hồi mọi phiên cũ trên mọi thiết bị.
      await revokeSession(matchedAccount);
      clearAuthCookies(res);

      try {
        await sendPasswordChangedEmail(
          matchedAccount.email,
          matchedAccount.fullName,
        );
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

  async submitAppeal(req, res) {
    try {
      const { email, fullName, message } = req.body;

      if (!email || typeof email !== "string" || !email.trim()) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập email.",
        });
      }
      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập nội dung khiếu nại.",
        });
      }

      const report = await Report.create({
        type: "account_appeal",
        reporterId: null,
        reporterEmail: email.trim(),
        reporterFullName:
          fullName && typeof fullName === "string"
            ? fullName.trim()
            : undefined,
        description: message.trim(),
        status: "pending",
      });

      const io = req.app.get("io");
      const adminAccounts = await Account.find({ role: "admin" })
        .select("_id")
        .lean();
      const shortMessage =
        message.trim().length > 80
          ? message.trim().slice(0, 80) + "…"
          : message.trim();
      const notifTitle = "Khiếu nại mới - Tài khoản bị khóa";
      const notifMessage = `${email.trim()}${fullName ? ` (${fullName.trim()})` : ""}: ${shortMessage}`;

      for (const admin of adminAccounts) {
        try {
          await saveAndEmitNotification(io, admin._id, {
            type: "system",
            title: notifTitle,
            message: notifMessage,
            link: "/admin/reports",
            metadata: { reportId: report._id.toString() },
          });
        } catch (e) {
          console.error("Lỗi gửi thông báo khiếu nại cho admin:", e.message);
        }
      }

      setImmediate(async () => {
        try {
          await sendAppealReceivedToUserEmail(
            email.trim(),
            fullName?.trim() || null,
          );
        } catch (e) {
          console.error(
            "Lỗi gửi email xác nhận khiếu nại cho user:",
            e.message,
          );
        }
      });

      return res.status(200).json({
        success: true,
        message:
          "Đã gửi khiếu nại. Chúng tôi sẽ xem xét và liên hệ bạn qua email.",
      });
    } catch (error) {
      console.error("submitAppeal error:", error);
      return res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
      });
    }
  }
}

module.exports = new AuthController();
