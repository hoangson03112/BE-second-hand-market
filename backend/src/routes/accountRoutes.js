const express = require("express");
const AccountController = require("../controllers/AccountController");
const verifyToken = require("../middlewave/verifyToken");

const router = express.Router();

router.get("/authentication", verifyToken, AccountController.Authentication);
router.get("/admin/get-accounts", AccountController.getAccountsByAdmin);
router.get("/account/:id", AccountController.getAccountById);

router.post("/register", AccountController.Register);
router.post("/verify", AccountController.Verify);
router.post("/login", AccountController.Login);
router.post(
  "/admin/create-account",
  verifyToken,
  AccountController.createAccountByAdmin
);

router.put("/update", verifyToken, AccountController.updateAccountInfo);
router.put(
  "/admin/update-account/:userId",
  AccountController.updateAccountByAdmin
);

module.exports = router;
