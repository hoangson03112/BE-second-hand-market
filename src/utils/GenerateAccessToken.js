const jwt = require("jsonwebtoken");

/**
 * Access token phải ngắn hạn: nó không thể thu hồi được (không tra DB mỗi
 * request), nên tuổi thọ chính là cửa sổ rủi ro nếu bị đánh cắp. 15 phút cũng
 * là con số khớp với maxAge của cookie accessToken — trước đây env để 1d khiến
 * token còn sống cả ngày trong khi cookie đã hết sau 15 phút.
 */
const ACCESS_TOKEN_TTL = "15m";

const GenerateAccessToken = (id) => {
  return jwt.sign({ _id: id }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL
  });
};

module.exports = GenerateAccessToken;