const express = require("express");
const ChatController = require("../controllers/ChatController");
const verifyToken = require("../middlewave/verifyToken");

const router = express.Router();

router.get("/messages", verifyToken, ChatController.getAllChat);

module.exports = router;
