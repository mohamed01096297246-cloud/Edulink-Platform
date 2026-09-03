const express = require("express");
const router = express.Router();

const {
  getClassroomWeeklyEvaluation,
  saveBulkWeeklyEvaluation,
} = require("../controllers/weeklyEvaluationController");

const { protect, authorize } = require("../middleware/authMiddleware");

router.get(
  "/classroom/:classroomId",
  protect,
  authorize("teacher"),
  getClassroomWeeklyEvaluation,
);

router.post("/bulk", protect, authorize("teacher"), saveBulkWeeklyEvaluation);

module.exports = router;
