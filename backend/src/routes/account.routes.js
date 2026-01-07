const express = require("express");
const AccountController = require("../controllers/AccountController");
const verifyToken = require("../middleware/verifyToken");
const { verifyAccessToken, verifyRefreshToken } = require("../middleware/auth");
const { authLimiter, strictLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// Public authentication routes with rate limiting
router.post("/register", authLimiter, AccountController.Register);
router.post("/verify", strictLimiter, AccountController.Verify);
router.post("/login", authLimiter, AccountController.Login);
router.post("/refresh", verifyRefreshToken, AccountController.RefreshToken);
router.post("/logout", AccountController.Logout);
router.get("/auth", verifyAccessToken, AccountController.Authentication);

// User account management routes
router.get("/:id", AccountController.getAccountById);
router.put("/update", verifyToken, AccountController.updateAccountInfo);
router.put("/change-password", verifyToken, AccountController.changePassword);

// Admin account management routes
router.post(
  "/admin/create",
  verifyToken,
  AccountController.createAccountByAdmin
);
router.get("/admin/list", verifyToken, AccountController.getAccountsByAdmin);
router.put(
  "/admin/update/:accountId",
  verifyToken,
  AccountController.updateAccountByAdmin
);

module.exports = router;
