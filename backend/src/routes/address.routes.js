const express = require("express");
const router = express.Router();
const AddressController = require("../controllers/AddressController");
const verifyToken = require("../middleware/verifyToken");
const { asyncHandler } = require("../shared/errors/errorHandler");
const {
  cacheByUser,
  createCacheInvalidationMiddleware,
} = require("../shared/middleware/cache.middleware.functional");

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
