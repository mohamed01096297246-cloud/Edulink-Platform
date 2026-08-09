const express = require("express");
const router = express.Router();

const {
  recordBulkAttendance,
  getAllAttendance,
  getAttendanceById,
  getStudentAttendance,
  updateAttendance,
  checkExistingAttendance,
} = require("../controllers/attendanceController");

const { protect, authorize } = require("../middleware/authMiddleware");

router.post("/bulk", protect, authorize("teacher"), recordBulkAttendance);

router.get("/", protect, authorize("teacher", "admin"), getAllAttendance);

router.get("/:id", protect, authorize("admin"), getAttendanceById);

router.get(
  "/student/:studentId",
  protect,
  authorize("parent"),
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

