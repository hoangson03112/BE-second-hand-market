const jwt = require("jsonwebtoken");

/**
 * @param {string} id   ID tài khoản
 * @param {string} jti  Định danh token, dùng để tra đúng bản ghi trong
 *   `account.refreshTokens` khi xoay vòng hoặc thu hồi.
 *
 *   Nó cũng là phần ngẫu nhiên duy nhất của token: payload trước đây chỉ có
 *   {_id} + iat tính theo GIÂY, nên hai lần ký trong cùng một giây cho ra đúng
 *   một chuỗi token giống hệt nhau.
 */
const GenerateRefreshToken = (id, jti) => {
  return jwt.sign({ _id: id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
    ...(jti ? { jwtid: jti } : {})
  });
};

module.exports = GenerateRefreshToken;
