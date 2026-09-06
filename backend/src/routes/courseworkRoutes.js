const express = require("express");
const router = express.Router();

const {
  getClassroomCoursework,
  getClassroomWeekCoursework,
  saveWeekCourseworkOverrides,
} = require("../controllers/courseworkController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Declared before "/classroom/:classroomId" so "week" isn't swallowed as a
// classroom id.
router.get(
  "/classroom/:classroomId/week",
  protect,
  authorize("teacher"),
  getClassroomWeekCoursework,
);

router.post(
  "/week/bulk",
  protect,
  authorize("teacher"),
  saveWeekCourseworkOverrides,
);

router.get(
  "/classroom/:classroomId",
  protect,
  authorize("teacher"),
  getClassroomCoursework,
);

module.exports = router;
