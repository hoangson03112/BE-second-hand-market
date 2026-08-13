const jwt = require("jsonwebtoken");

const GenerateRefreshToken = (id) => {
  return jwt.sign({ _id: id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN
  });
};

module.exports = GenerateRefreshToken;