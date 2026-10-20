const express = require("express");
const router = express.Router();

const {
  getParentDashboard,
  getStudentReport,
  getWeekEvaluation,
  getHomeworkWeek,
  getMonthlyTests,
} = require("../controllers/parentController");
const { protect, authorize, requireUserFeature } = require("../middleware/authMiddleware");

router.get("/dashboard", protect, authorize("parent"), getParentDashboard);
router.get(
  "/report/:studentId",
  protect,
  authorize("parent"),
  requireUserFeature("report"),
  getStudentReport
);
router.get(
  "/week-evaluation/:studentId",
  protect,
  authorize("parent"),
  requireUserFeature("report"),
  getWeekEvaluation
);
router.get(
  "/homework-week/:studentId",
  protect,
  authorize("parent"),
  requireUserFeature("homework"),
  getHomeworkWeek
);
router.get(
  "/monthly-tests/:studentId",
  protect,
  authorize("parent"),
  requireUserFeature("grades"),
  getMonthlyTests
);

module.exports = router;