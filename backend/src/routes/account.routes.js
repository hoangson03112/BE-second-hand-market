const express = require("express");
const AccountController = require("../controllers/AccountController");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

// Public authentication routes
router.post("/register", AccountController.Register);
router.post("/verify", AccountController.Verify);
router.post("/login", AccountController.Login);
router.get("/auth", verifyToken, AccountController.Authentication);

// User account management routes
router.get("/:id", AccountController.getAccountById);
router.put("/update", verifyToken, AccountController.updateAccountInfo);

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
