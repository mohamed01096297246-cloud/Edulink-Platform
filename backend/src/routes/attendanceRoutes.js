const express = require("express");
const router = express.Router();

const {
  recordBulkAttendance,
  getAllAttendance,
  getAttendanceById,
  getStudentAttendance,
  updateAttendance,
  checkExistingAttendance,
  addDailyAbsentees,
  getDailyToday,
  getDailyFirstLessons,
} = require("../controllers/attendanceController");

const { protect, authorize, requireUserFeature } = require("../middleware/authMiddleware");

router.post("/bulk", protect, authorize("teacher"), recordBulkAttendance);

// The daily register (School.attendanceMode "daily"): the teacher's classes
// today and their registers, and adding absentees after the first period.
router.get("/daily/today", protect, authorize("teacher"), getDailyToday);
router.get("/daily/first-lessons", protect, authorize("teacher"), getDailyFirstLessons);
router.post("/daily/absent", protect, authorize("teacher"), addDailyAbsentees);

router.get("/", protect, authorize("teacher", "admin"), getAllAttendance);

router.get("/:id", protect, authorize("admin"), getAttendanceById);

router.get(
  "/student/:studentId",
  protect,
  authorize("parent"),
  requireUserFeature("attendance"),
  getStudentAttendance,
);

router.put("/:id", protect, authorize("teacher"), updateAttendance);
router.get(
  "/check/:scheduleId",
  protect,
  authorize("teacher"),
  checkExistingAttendance,
);
module.exports = router;

