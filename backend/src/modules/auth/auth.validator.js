const { ValidationError } = require("../../constants/errors");

function validateChangePasswordPayload({ oldPassword, newPassword }) {
  if (!oldPassword || !newPassword) {
    throw new ValidationError("Thiếu thông tin mật khẩu");
  }

  if (typeof newPassword !== "string" || newPassword.length < 6) {
    throw new ValidationError("Mật khẩu mới tối thiểu 6 ký tự");
  }
}

function validateSetPasswordPayload(newPassword) {
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    throw new ValidationError("Mật khẩu mới tối thiểu 6 ký tự");
  }
}

function validateLoginPayload({ username, email, password }) {
  const identifier = String(username || email || "").trim();
  if (!identifier || !password) {
    throw new ValidationError("Thiếu thông tin đăng nhập");
  }

  return identifier;
}

function validatePasswordStrength(password) {
  if (typeof password !== "string") {
    throw new ValidationError("Mật khẩu không hợp lệ");
  }

  if (password.length < 8) {
    throw new ValidationError("Mật khẩu phải có ít nhất 8 ký tự");
  }

  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new ValidationError("Mật khẩu phải có chữ hoa, chữ thường, số và ký tự đặc biệt");
  }
}

module.exports = {
  validateChangePasswordPayload,
  validateSetPasswordPayload,
  validateLoginPayload,
  validatePasswordStrength
};