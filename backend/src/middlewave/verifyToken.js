const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  let token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(403).json({ message: "No token provided" });
  }

  jwt.verify(token, "sown", (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "JWT expired or invalid" });
    }

    req.accountID = decoded._id;

    next(); // Chuyển tiếp sang controller tiếp theo
  });
};

module.exports = verifyToken;
