const express = require("express");
const router = express.Router();
const {
  getToday,
  getSchedule,
  getHomework,
  getGrades,
  getPerformance,
  getNotifications,
  markNotificationsRead,
} = require("../controllers/studentAppController");
const { protect, authorize, requireUserFeature } = require("../middleware/authMiddleware");

// A student reads their own record and nothing else — which student is
// taken from the account on the token, never from the request, so there is
// no id here for anyone to change.
router.use(protect, authorize("student"));

// Each screen can be switched off for one student by the platform owner
// (User.appFeatures, from the schools page's «الطلاب»): يومي is `home`,
// أدائي is `report`.
router.get("/today", requireUserFeature("home"), getToday);
router.get("/schedule", requireUserFeature("schedule"), getSchedule);
router.get("/homework", requireUserFeature("homework"), getHomework);
router.get("/grades", requireUserFeature("grades"), getGrades);
router.get("/performance", requireUserFeature("report"), getPerformance);
router.get("/notifications", requireUserFeature("notifications"), getNotifications);
router.patch("/notifications/read", requireUserFeature("notifications"), markNotificationsRead);

module.exports = router;
