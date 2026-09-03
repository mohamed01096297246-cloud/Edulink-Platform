const express = require("express");
const router = express.Router();

const {
  createNotification,
  getParentNotifications,
  getAllNotifications,
  getMyNotifications,
  getTeacherParentsList,
  updateNotification,
  deleteNotification,
} = require("../controllers/notificationController");

const { protect, authorize, requireUserFeature } = require("../middleware/authMiddleware");

router.post("/", protect, authorize("admin", "teacher"), createNotification);

router.get("/parent", protect, authorize("parent"), requireUserFeature("notifications"), getParentNotifications);

router.get("/mine", protect, authorize("teacher"), getMyNotifications);

router.get(
  "/teacher-parents",
  protect,
  authorize("teacher"),
  getTeacherParentsList,
);

router.get("/", protect, authorize("admin"), getAllNotifications);

router.put("/:id", protect, authorize("admin", "teacher"), updateNotification);

router.delete("/:id", protect, authorize("admin", "teacher"), deleteNotification);

module.exports = router;
