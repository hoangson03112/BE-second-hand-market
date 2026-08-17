const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const authRepository = require("./auth.repository");
const config = require("../../config/env");
const { MESSAGES } = require("../../utils/messages");
const GenerateAccessToken = require("../../utils/GenerateAccessToken");
const GenerateRefreshToken = require("../../utils/GenerateRefreshToken");
const { revokeSession } = require("../../services/token.service");
const {
  generateVerificationCode,
  sendVerificationEmail,
  sendPasswordChangedEmail,
  sendResetPasswordEmail,
  sendAccountChangeEmail,
  sendAccountBannedEmail,
  sendAccountUnbannedEmail,
  sendAppealReceivedToUserEmail
} = require("../../services/email.service");
const { saveAndEmitNotification } = require("../../utils/notification");
const Report = require("../../models/Report");
const Seller = require("../../models/Seller");
const Product = require("../../models/Product");
const { logAdminAction } = require("../../services/adminAuditLog.service");
const { ValidationError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError } = require("../../constants/errors");
const { validatePasswordStrength } = require("./auth.validator");

function generatePendingGoogleVerifyToken(accountId) {
  return jwt.sign(
    { _id: accountId, purpose: "google_email_verify" },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "10m" }
  );
}

async function changePassword({ accountId, oldPassword, newPassword, clearCookie }) {
  validatePasswordStrength(newPassword);

  const account = await authRepository.findById(accountId);
  if (!account) {
    throw new NotFoundError(MESSAGES.AUTH.ACCOUNT_NOT_FOUND);
  }

  if (account.googleId) {
    throw new ValidationError(MESSAGES.AUTH.GOOGLE_CANNOT_CHANGE_PASSWORD);
  }

  if (!account.password) {
    throw new ValidationError(MESSAGES.AUTH.NO_PASSWORD_SET);
  }

  const isMatch = await bcrypt.compare(oldPassword, account.password);
  if (!isMatch) {
    throw new ValidationError(MESSAGES.AUTH.OLD_PASSWORD_WRONG);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  account.password = hashedPassword;
  await account.save();

  // Đổi mật khẩu ⇒ thu hồi phiên trên MỌI thiết bị.
  await revokeSession(account);
  clearCookie?.();

  try {
    await sendPasswordChangedEmail(account.email, account.fullName);
  } catch (emailError) {
    console.error("Lỗi gửi email:", emailError);
  }

  return { message: MESSAGES.AUTH.CHANGE_PASSWORD_SUCCESS };
}

async function setPassword({ accountId, newPassword, clearCookie }) {
  validatePasswordStrength(newPassword);

  const account = await authRepository.findById(accountId);
  if (!account) {
    throw new NotFoundError(MESSAGES.AUTH.ACCOUNT_NOT_FOUND);
  }

  if (!account.googleId) {
    throw new ValidationError("Tài khoản đã có mật khẩu. Vui lòng dùng Đổi mật khẩu.");
  }

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    throw new ValidationError("Mật khẩu mới tối thiểu 6 ký tự.");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  account.password = hashedPassword;
  await account.save();

  // Vừa đặt mật khẩu ⇒ thu hồi phiên cũ, buộc đăng nhập lại.
  await revokeSession(account);
  clearCookie?.();

  try {
    await sendPasswordChangedEmail(account.email, account.fullName);
  } catch (emailError) {
    console.error("Lỗi gửi email:", emailError);
  }

  return { message: MESSAGES.AUTH.SET_PASSWORD_SUCCESS };
}

async function login({ identifier, password }) {
  if (!identifier || !password) throw new ValidationError(MESSAGES.MISSING_FIELDS);

  const account = await authRepository.findByIdentifier(identifier);

  if (!account || !account.password) throw new UnauthorizedError(MESSAGES.AUTH.WRONG_CREDENTIALS);
  if (account.lockUntil && new Date(account.lockUntil) > new Date()) {
    throw new ForbiddenError("Tài khoản tạm thời bị khóa do đăng nhập sai quá nhiều lần");
  }

  const isMatch = await bcrypt.compare(password, account.password);
  if (!isMatch) {
    account.loginAttempts = (account.loginAttempts || 0) + 1;
    if (account.loginAttempts >= 5) account.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    await account.save();
    throw new UnauthorizedError(MESSAGES.AUTH.WRONG_CREDENTIALS);
  }

  if (account.status === "inactive") throw new ForbiddenError(MESSAGES.AUTH.ACCOUNT_NOT_ACTIVATED);
  if (account.status === "banned") throw new ForbiddenError(MESSAGES.AUTH.ACCOUNT_BANNED);

  const accessToken = GenerateAccessToken(account._id);
  const refreshToken = GenerateRefreshToken(account._id);

  account.refreshToken = await bcrypt.hash(refreshToken, 10);
  account.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  account.refreshTokenAbsoluteExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  account.lastLogin = new Date();
  account.loginAttempts = 0;
  account.lockUntil = undefined;
  await account.save();

  const userObj = account.toObject();
  delete userObj.password;
  delete userObj.refreshToken;

  return {
    message: MESSAGES.AUTH.LOGIN_SUCCESS,
    user: userObj,
    accessToken,
    refreshToken
  };
}

module.exports = {
  changePassword,
  setPassword,
  login,
  generatePendingGoogleVerifyToken
};