const jwt = require("jsonwebtoken");

const GenerateToken = (id) => {
  return jwt.sign({ _id: id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};
module.exports = GenerateToken;
