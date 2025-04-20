const jwt = require("jsonwebtoken");
const config = require("../../config/env");
const logger = require("../utils/logger");

/**
 * Middleware to verify JWT token from request headers
 */
const verifyToken = (req, res, next) => {
  try {
    // Get token from Authorization header
    let token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(403).json({ message: "No token provided" });
    }

    // Verify token
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        logger.warn(`Invalid token: ${err.message}`);
        return res.status(401).json({ message: "JWT expired or invalid" });
      }

      // Set user ID in request for use in controllers
      req.accountID = decoded._id;

      // Continue to next middleware or controller
      next();
    });
  } catch (error) {
    logger.error(`Token verification error: ${error.message}`);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = verifyToken;
