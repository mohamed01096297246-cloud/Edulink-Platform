const express = require("express");
const router = express.Router();

const {
  exportWeeklyRegister,
  exportMonthlyRegister,
  exportTermRegister,
} = require("../controllers/gradeRegisterController");

const { protect, authorize } = require("../middleware/authMiddleware");

router.get(
  "/week/:classroomId",
  protect,
  authorize("teacher"),
  exportWeeklyRegister,
);

router.get(
  "/month/:classroomId",
  protect,
  authorize("teacher"),
  exportMonthlyRegister,
);

// أعمال السنة for a whole term — weekly40 classrooms only.
router.get(
  "/term/:classroomId",
  protect,
  authorize("teacher"),
  exportTermRegister,
);

module.exports = router;
