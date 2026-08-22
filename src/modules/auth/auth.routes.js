const { safeRouter } = require("../../utils/safeRouter");
const passport = require("passport");
const AuthController = require("./auth.controller");
const verifyToken = require("../../middlewares/verifyToken");
const verifyAdmin = require("../../middlewares/verifyAdmin");
const { verifyRefreshToken } = require("../../middlewares/auth");
const {
  authLimiter,
  strictLimiter,
  resendCodeLimiter,
  appealLimiter,
} = require("../../middlewares/rateLimiter");
const config = require("../../config/env");
const {
  createCacheInvalidationMiddleware,
} = require("../../middlewares/cache");

const invalidateAccountCache = createCacheInvalidationMiddleware("account*");

const router = safeRouter();

router.get(
  "/google",
  (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.redirect(
        `${config.frontendUrl}/login?error=google_not_configured`,
      );
    }
    next();
  },
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  }),
);
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${config.frontendUrl}/login?error=google_failed`,
  }),
  AuthController.googleCallback,
);

router.post("/register", authLimiter, AuthController.register);
router.post("/verify", strictLimiter, AuthController.verify);
router.post(
  "/resend-verification-code",
  resendCodeLimiter,
  AuthController.resendVerificationCode,
);
router.post("/login", authLimiter, AuthController.login);
router.post("/forgot-password", authLimiter, AuthController.forgotPassword);
router.post(
  "/validate-reset-token",
  authLimiter,
  AuthController.validateResetToken,
);
router.post("/reset-password", authLimiter, AuthController.resetPassword);
router.post("/refresh", verifyRefreshToken, AuthController.refreshToken);
// logout không gắn middleware: phải xoá được phiên kể cả khi access token đã
// hết hạn. Controller tự xác định tài khoản từ refresh token cookie.
router.post("/logout", AuthController.logout);
router.get("/me", verifyToken, AuthController.me);

// Đăng nhập/đăng ký bằng Google không cần xác minh email: Google đã xác minh
// hộ, nên googleCallback phát session luôn.
router.post("/appeal", appealLimiter, AuthController.submitAppeal);

router.get(
  "/admin/list",
  verifyToken,
  verifyAdmin,
  AuthController.getAccountsByAdmin,
);
router.put(
  "/admin/:id/status",
  verifyToken,
  verifyAdmin,
  invalidateAccountCache,
  AuthController.updateAccountStatusByAdmin,
);

module.exports = router;
