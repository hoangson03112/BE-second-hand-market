const express = require("express");
const passport = require("passport");
const AccountController = require("./auth.controller");
const verifyToken = require("../../middlewares/verifyToken");
const verifyAdmin = require("../../middlewares/verifyAdmin");
const { verifyAccessToken, verifyRefreshToken } = require("../../middlewares/auth");
const { authLimiter, strictLimiter, appealLimiter } = require("../../middlewares/rateLimiter");
const config = require("../../config/env");
const {
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
} = require("../../middlewares/cache");

const invalidateAccountCache = createCacheInvalidationMiddleware("account*");

const router = express.Router();

// Google OAuth (redirect + callback)
router.get(
  "/google",
  (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.redirect(`${config.frontendUrl}/login?error=google_not_configured`);
    }
    next();
  },
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${config.frontendUrl}/login?error=google_failed`,
  }),
  AccountController.GoogleCallback
);

// Public authentication routes with rate limiting
router.post("/register", authLimiter, AccountController.Register);
router.post("/verify", strictLimiter, AccountController.Verify);
router.post("/login", authLimiter, AccountController.Login);
router.post("/forgot-password", authLimiter, AccountController.forgotPassword);
router.post("/reset-password", authLimiter, AccountController.resetPassword);
router.post("/refresh", verifyRefreshToken, AccountController.RefreshToken);
router.post("/logout", AccountController.Logout);
router.get("/auth", verifyAccessToken, AccountController.Authentication);
router.post("/verify-google-email", AccountController.verifyGoogleEmail);
router.post("/appeal", appealLimiter, AccountController.submitAppeal);

// User account management routes
router.get(
  "/:id",
  createCacheMiddleware({ ttl: 300, keyPrefix: 'account' }),
  AccountController.getAccountById
);
router.put(
  "/update",
  verifyToken,
  createCacheInvalidationMiddleware('account*'),
  AccountController.updateAccountInfo
);
router.put(
  "/change-password",
  verifyToken,
  createCacheInvalidationMiddleware('account*'),
  AccountController.changePassword
);
router.put(
  "/set-password",
  verifyToken,
  createCacheInvalidationMiddleware('account*'),
  AccountController.setPassword
);

// Admin account management routes
router.get("/admin/list", verifyToken, verifyAdmin, AccountController.getAccountsByAdmin);
router.put(
  "/admin/:id/status",
  verifyToken,
  verifyAdmin,
  invalidateAccountCache,
  AccountController.updateAccountStatusByAdmin
);

module.exports = router;

