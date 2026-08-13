const express = require("express");
const verifyToken = require("../../middlewares/verifyToken");
const {
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
} = require("../../middlewares/cache");
const accountsController = require("./accounts.controller");

const router = express.Router();

const invalidateAccountCache = createCacheInvalidationMiddleware("account*");

router.get(
  "/:id",
  createCacheMiddleware({ ttl: 300, keyPrefix: "account" }),
  accountsController.getAccountById,
);

router.put(
  "/profile",
  verifyToken,
  invalidateAccountCache,
  accountsController.updateAccountInfo,
);

router.put(
  "/change-password",
  verifyToken,
  invalidateAccountCache,
  accountsController.changePassword,
);

router.put(
  "/set-password",
  verifyToken,
  invalidateAccountCache,
  accountsController.setPassword,
);
router.put(
  "/update",
  verifyToken,
  createCacheInvalidationMiddleware("account*"),
  accountsController.updateAccountInfo,
);

module.exports = router;
