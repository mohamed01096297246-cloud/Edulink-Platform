const express = require("express");
const router = express.Router();

const {
  getClassroomsForGrade,
  getClassroomMonthlyGrades,
  saveBulkMonthlyGrades,
} = require("../controllers/monthlyGradeController");

const { protect, authorize } = require("../middleware/authMiddleware");

router.get(
  "/classrooms/:gradeId",
  protect,
  authorize("teacher"),
  getClassroomsForGrade,
);

router.get(
  "/classroom/:classroomId",
  protect,
  authorize("teacher"),
  getClassroomMonthlyGrades,
);

router.post("/bulk", protect, authorize("teacher"), saveBulkMonthlyGrades);

module.exports = router;
