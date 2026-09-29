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
  getAttendanceRegister,
  saveAttendanceRegister,
} = require("../controllers/attendanceController");

const { protect, authorize, requireUserFeature } = require("../middleware/authMiddleware");

router.post("/bulk", protect, authorize("teacher"), recordBulkAttendance);

// The daily register (School.attendanceMode "daily"): the teacher's classes
// today and their registers, and adding absentees after the first period.
router.get("/daily/today", protect, authorize("teacher"), getDailyToday);
// سجل الحضور: the whole school's register for any day (administration),
// and taking or correcting one after the teachers' window has closed.
// Declared before PUT /:id, which would otherwise read "register" as an id.
router.get("/register", protect, authorize("admin"), getAttendanceRegister);
router.put("/register", protect, authorize("admin"), saveAttendanceRegister);
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

