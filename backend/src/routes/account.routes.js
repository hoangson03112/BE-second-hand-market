const express = require("express");
const passport = require("passport");
const AccountController = require("../controllers/AccountController");
const verifyToken = require("../middleware/verifyToken");
const { verifyAccessToken, verifyRefreshToken } = require("../middleware/auth");
const { authLimiter, strictLimiter } = require("../middleware/rateLimiter");
const config = require("../config/app.config");
const {
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
} = require("../shared/middleware/cache.middleware.functional");

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
router.post("/refresh", verifyRefreshToken, AccountController.RefreshToken);
router.post("/logout", AccountController.Logout);
router.get("/auth", verifyAccessToken, AccountController.Authentication);

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

// Admin account management routes
router.post(
  "/admin/create",
  verifyToken,
  createCacheInvalidationMiddleware('account*'),
  AccountController.createAccountByAdmin
);
router.get("/admin/list", verifyToken, AccountController.getAccountsByAdmin);
router.put(
  "/admin/update/:accountId",
  verifyToken,
  createCacheInvalidationMiddleware('account*'),
  AccountController.updateAccountByAdmin
);

module.exports = router;
