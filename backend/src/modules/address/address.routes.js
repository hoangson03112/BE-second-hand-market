const express = require("express");
const router = express.Router();
const AddressController = require("./address.controller");
const verifyToken = require("../../middlewares/verifyToken");
const { asyncHandler } = require("../../middlewares/errorHandler");
const {
  cacheByUser,
  createCacheInvalidationMiddleware,
} = require("../../middlewares/cache");

router.post(
  "/create",
  verifyToken,
  createCacheInvalidationMiddleware('address*'),
  asyncHandler(AddressController.createAddress)
);
router.get(
  "/",
  verifyToken,
  cacheByUser({ ttl: 300, keyPrefix: 'addresses' }),
  asyncHandler(AddressController.getAddresses)
);
router.put(
  "/:id",
  verifyToken,
  createCacheInvalidationMiddleware('address*'),
  asyncHandler(AddressController.updateAddress)
);
router.delete(
  "/:id",
  verifyToken,
  createCacheInvalidationMiddleware('address*'),
  asyncHandler(AddressController.deleteAddress)
);

module.exports = router;

