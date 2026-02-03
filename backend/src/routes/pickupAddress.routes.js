const express = require("express");
const verifyToken = require("../middleware/verifyToken");
const {
  getPickupAddress,
  upsertPickupAddress,
} = require("../controllers/PickupAddressController");

const router = express.Router();

router.get("/", verifyToken, getPickupAddress);
router.put("/", verifyToken, upsertPickupAddress);

module.exports = router;
