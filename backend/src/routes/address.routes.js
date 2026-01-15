const express = require("express");
const router = express.Router();
const AddressController = require("../controllers/AddressController");
const verifyToken = require("../middleware/verifyToken");

router.post("/create", verifyToken, AddressController.createAddress);
router.get("/", verifyToken, AddressController.getAddresses);
router.put("/:id", verifyToken, AddressController.updateAddress);
router.delete("/:id", verifyToken, AddressController.deleteAddress);

module.exports = router;
