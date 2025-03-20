const jwt = require("jsonwebtoken");

const GenerateToken = (id) => {
  return jwt.sign({ _id: id }, "sown", {
    expiresIn: "6h",
  });
};
module.exports = GenerateToken;
