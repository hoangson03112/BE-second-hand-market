const Account = require("../../models/Account");
const config = require("../../config/env");
const Address = require("../../models/Address");

const jwt = require("jsonwebtoken");
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
  sendAccountBannedEmail,
  sendAccountUnbannedEmail,
  sendAppealReceivedToUserEmail,
} = require("../../services/email.service");
const Report = require("../../models/Report");
const { saveAndEmitNotification } = require("../../utils/notification");

/** Token tạm cho bước xác minh email sau đăng nhập Google (exp 10 phút) */
function generatePendingGoogleVerifyToken(accountId) {
  return jwt.sign(
    { _id: accountId, purpose: "google_email_verify" },
    process.env.JWT_SECRET,
    { expiresIn: "10m" }
  );
}
const Seller = require("../../models/Seller");
const Product = require("../../models/Product");
const { logAdminAction } = require("../../services/adminAuditLog.service");

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
      // Revoke all existing refresh tokens so user must log in again
      account.refreshToken = undefined;
      account.refreshTokenExpires = undefined;
      account.refreshTokenAbsoluteExpires = undefined;
      await account.save();
      
      // Clear refresh token cookie on all clients
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });
      
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

  async setPassword(req, res) {
    try {
      const { newPassword } = req.body;
      const account = await Account.findById(req.accountID);
      if (!account) {
        return res.status(404).json({ message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND });
      }
      if (!account.googleId) {
        return res.status(400).json({
          message: "Tài khoản đã có mật khẩu. Vui lòng dùng Đổi mật khẩu.",
        });
      }
      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
        return res.status(400).json({
          message: "Mật khẩu mới tối thiểu 6 ký tự.",
        });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      account.password = hashedPassword;
      // Revoke all existing refresh tokens so user must log in again
      account.refreshToken = undefined;
      account.refreshTokenExpires = undefined;
      account.refreshTokenAbsoluteExpires = undefined;
      await account.save();

      // Clear refresh token cookie on all clients
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });

      try {
        await sendPasswordChangedEmail(account.email, account.fullName);
      } catch (emailError) {
        console.error("Lỗi gửi email:", emailError);
      }

      return res.status(200).json({ message: MESSAGES.AUTH.SET_PASSWORD_SUCCESS });
    } catch (error) {
      console.error("setPassword error:", error);
      return res.status(500).json({
        message: MESSAGES.AUTH.SET_PASSWORD_ERROR,
      });
    }
  }

  async Login(req, res) {
    try {
      const data = req.body || {};
      const identifier = String(data.username || data.email || "").trim();
      const password = String(data.password || "");

      if (!identifier || !password) {
        return res.status(400).json({
          status: "error",
          type: "missing_fields",
          message: MESSAGES.MISSING_FIELDS,
        });
      }

      const account = await Account.findOne({
        $or: [{ username: identifier }, { email: identifier.toLowerCase() }],
      });

      if (!account || !account.password) {
        return res.status(401).json({
          status: "error",
          type: "credentials",
          message: MESSAGES.AUTH.WRONG_CREDENTIALS,
        });
      }

      const isMatch = await bcrypt.compare(password, account.password);
      if (!isMatch) {
        return res.status(401).json({
          status: "error",
          type: "credentials",
          message: MESSAGES.AUTH.WRONG_CREDENTIALS,
        });
      }

      if (account.status === "inactive") {
        return res.status(403).json({
          status: "inactive",
          message: MESSAGES.AUTH.ACCOUNT_NOT_ACTIVATED,
        });
      }

      if (account.status === "banned") {
        return res.status(403).json({
          status: "banned",
          message: MESSAGES.AUTH.ACCOUNT_BANNED,
        });
      }

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

      // Set refreshToken vào HttpOnly cookie
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      // Trả cả access + refresh token để tương thích automation test
      return res.status(200).json({
        status: "success",
        message: MESSAGES.AUTH.LOGIN_SUCCESS,
        token: accessToken,
        refreshToken,
      });
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

      // If this Google account has logged in successfully before, skip OTP step.
      // We keep OTP only for first-time Google login flow.
      if (account.lastLogin) {
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

        return res.redirect(
          `${config.frontendUrl}/login?token=${encodeURIComponent(accessToken)}`
        );
      }

      // First-time Google verification: send OTP and redirect to verify page.
      const verificationCode = generateVerificationCode();
      account.verificationCode = verificationCode;
      account.codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 phút
      await account.save();
      await sendVerificationEmail(account.email, verificationCode);
      const pendingToken = generatePendingGoogleVerifyToken(account._id.toString());
      const verifyUrl = `${config.frontendUrl}/verify-google-email?pending=${encodeURIComponent(pendingToken)}&email=${encodeURIComponent(account.email)}`;
      return res.redirect(verifyUrl);
    } catch (error) {
      console.error("Google callback error:", error);
      return res.redirect(
        `${config.frontendUrl}/login?error=google_failed`
      );
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
        decoded = jwt.verify(pending, process.env.JWT_SECRET);
      } catch {
        return res.status(400).json({
          status: "error",
          message: "Phiên xác minh hết hạn. Vui lòng đăng nhập lại bằng Google.",
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
      if (!account.verificationCode || account.verificationCode !== code.trim()) {
        return res.status(400).json({
          status: "error",
          message: "Mã xác minh không đúng.",
        });
      }
      if (!account.codeExpires || new Date(account.codeExpires) < new Date()) {
        return res.status(400).json({
          status: "error",
          message: "Mã xác minh đã hết hạn. Vui lòng đăng nhập lại bằng Google.",
        });
      }
      account.verificationCode = undefined;
      account.codeExpires = undefined;
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
      return res.status(200).json({
        status: "success",
        message: MESSAGES.AUTH.LOGIN_SUCCESS,
        token: accessToken,
      });
    } catch (error) {
      console.error("verifyGoogleEmail error:", error);
      return res.status(500).json({ status: "error", message: MESSAGES.SERVER_ERROR });
    }
  }

  async Register(req, res) {
    try {
      const data = req.body || {};
      const username = typeof data.username === "string" ? data.username.trim() : "";
      const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
      const password = typeof data.password === "string" ? data.password : "";
      const phoneNumber = typeof data.phoneNumber === "string" ? data.phoneNumber.trim() : "";

      // Require only email + password; username can be auto-generated for API compatibility.
      if (!email || !password) {
        return res.status(400).json({
          status: "error",
          type: "missing_fields",
          message: MESSAGES.MISSING_FIELDS,
        });
      }

      let resolvedUsername = username;
      if (!resolvedUsername) {
        const base = (email.split("@")[0] || "user")
          .replace(/[^a-zA-Z0-9_.-]/g, "")
          .slice(0, 20) || "user";
        resolvedUsername = base;
        let suffix = 0;
        while (await Account.findOne({ username: resolvedUsername })) {
          suffix += 1;
          resolvedUsername = `${base}_${suffix}`;
        }
      }

      const [existingUsername, existingEmail, existingPhone] = await Promise.all([
        Account.findOne({ username: resolvedUsername }),
        Account.findOne({ email }),
        phoneNumber ? Account.findOne({ phoneNumber }) : Promise.resolve(null),
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
      await sendVerificationEmail(email, verificationCode);
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
        { verificationCode, codeExpires: Date.now() + 15 * 60 * 1000 } // 15 phút hết hạn
      );

      return res.status(200).json({
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
      const { page = 1, limit = 20, search, status, role, startDate, endDate } = req.query;
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
        query.$or = [{ fullName: re }, { email: re }, { phoneNumber: re }, { username: re }];
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
      let hiddenProductsCount = 0;
      let cancelledOrdersCount = 0;

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

      if (status === "banned") {
        // Ẩn toàn bộ sản phẩm mà account này đăng (dù là buyer hay seller)
        try {
          const productUpdateResult = await Product.updateMany(
            {
              sellerId: account._id,
              status: { $in: ["approved", "active"] },
            },
            { $set: { status: "inactive" } }
          );
          hiddenProductsCount =
            typeof productUpdateResult?.modifiedCount === "number"
              ? productUpdateResult.modifiedCount
              : 0;
        } catch (e) {
          console.error("Lỗi cập nhật trạng thái sản phẩm khi khóa tài khoản:", e.message);
        }

        // Tự động hủy các đơn chưa giao cho GHN mà account này là seller:
        // - status: "pending" (buyer đặt nhưng seller chưa confirm)
        // - status: "confirmed" (đã confirm nhưng GHN chưa lấy hàng)
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

          // Hủy đơn trên GHN (best-effort) cho các order có ghnOrderCode
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
        // Nếu account có hồ sơ seller đã được duyệt thì đảm bảo role vẫn là seller sau khi mở khóa
        try {
          const seller = await Seller.findOne({ accountId: account._id })
            .select("verificationStatus")
            .lean();
          if (seller?.verificationStatus === "approved" && account.role !== "seller") {
            account.role = "seller";
            await account.save();
          }
        } catch (e) {
          console.error("Lỗi đồng bộ role seller khi mở khóa account:", e.message);
        }
      }

      if (status === "banned") {
        // Realtime: thông báo ngay cho user đang online (socket room = accountId)
        try {
          const io = req.app.get("io");
          if (io) {
            io.to(account._id.toString()).emit("account-banned", {
              message: "Tài khoản của bạn đã bị khóa. Bạn không thể thực hiện thao tác. Nếu cho rằng đây là nhầm lẫn, vui lòng gửi khiếu nại đến quản trị viên.",
            });
          }
        } catch (e) {
          console.error("Lỗi emit account-banned socket:", e.message);
        }
      }

      // Gửi email thông báo cho người dùng (best-effort, không chặn response)
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
          console.error("Lỗi gửi email thông báo trạng thái tài khoản:", e.message);
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
        console.error("Lỗi ghi audit log cập nhật trạng thái account:", e.message);
      }

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
  async validateResetToken(req, res) {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          valid: false,
          message: MESSAGES.AUTH.RESET_TOKEN_INVALID,
        });
      }

      // Tìm tài khoản có token chưa hết hạn
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
      // Revoke all existing refresh tokens so user must log in again
      matchedAccount.refreshToken = undefined;
      matchedAccount.refreshTokenExpires = undefined;
      matchedAccount.refreshTokenAbsoluteExpires = undefined;
      await matchedAccount.save();

      // Clear refresh token cookie if client đang giữ
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });

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

  /**
   * POST /auth/appeal — Gửi khiếu nại khi tài khoản bị khóa (không cần token).
   * Body: { email, fullName?, message }
   * Lưu vào Report (type account_appeal), thông báo realtime cho admin, gửi email xác nhận cho user.
   */
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
        reporterFullName: fullName && typeof fullName === "string" ? fullName.trim() : undefined,
        description: message.trim(),
        status: "pending",
      });

      const io = req.app.get("io");
      const adminAccounts = await Account.find({ role: "admin" }).select("_id").lean();
      const shortMessage = message.trim().length > 80 ? message.trim().slice(0, 80) + "…" : message.trim();
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
          await sendAppealReceivedToUserEmail(email.trim(), fullName?.trim() || null);
        } catch (e) {
          console.error("Lỗi gửi email xác nhận khiếu nại cho user:", e.message);
        }
      });

      return res.status(200).json({
        success: true,
        message: "Đã gửi khiếu nại. Chúng tôi sẽ xem xét và liên hệ bạn qua email.",
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

module.exports = new AccountController();

