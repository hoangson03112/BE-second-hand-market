const express = require("express");
const router = express.Router();
const AddressController = require("../controllers/AddressController");
const verifyToken = require("../middleware/verifyToken");
const { asyncHandler } = require("../shared/errors/errorHandler");

router.post(
  "/create",
  verifyToken,
  asyncHandler(AddressController.createAddress)
);
router.get("/", verifyToken, asyncHandler(AddressController.getAddresses));
router.put("/:id", verifyToken, asyncHandler(AddressController.updateAddress));
router.delete(
  "/:id",
  verifyToken,
  asyncHandler(AddressController.deleteAddress)
);

module.exports = router;
