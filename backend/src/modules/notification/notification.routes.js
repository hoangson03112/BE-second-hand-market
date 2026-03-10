const express = require("express");
const NotificationController = require("./notification.controller");
const verifyToken = require("../../middlewares/verifyToken");
const { asyncHandler } = require("../../middlewares/errorHandler");

const router = express.Router();

router.get("/", verifyToken, asyncHandler(NotificationController.getMyNotifications));
router.patch("/read-all", verifyToken, asyncHandler(NotificationController.markAllAsRead));
router.patch("/read/:id", verifyToken, asyncHandler(NotificationController.markAsRead));
router.delete("/:id", verifyToken, asyncHandler(NotificationController.deleteNotification));

module.exports = router;
