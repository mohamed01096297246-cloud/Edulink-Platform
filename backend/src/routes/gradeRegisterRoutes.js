const express = require("express");
const router = express.Router();

const {
  exportWeeklyRegister,
  exportMonthlyRegister,
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

module.exports = router;
