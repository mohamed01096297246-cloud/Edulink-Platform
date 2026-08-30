const express = require("express");
const router = express.Router();

const {
  createNotification,
  getParentNotifications,
  getAllNotifications,
  updateNotification,
  deleteNotification,
} = require("../controllers/notificationController");

const { protect, authorize, requireUserFeature } = require("../middleware/authMiddleware");

router.post("/", protect, authorize("admin"), createNotification);

router.get("/parent", protect, authorize("parent"), requireUserFeature("notifications"), getParentNotifications);

router.get("/", protect, authorize("admin"), getAllNotifications);

router.put("/:id", protect, authorize("admin"), updateNotification);

router.delete("/:id", protect, authorize("admin"), deleteNotification);

module.exports = router;
