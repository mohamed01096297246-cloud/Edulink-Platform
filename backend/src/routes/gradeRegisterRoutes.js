const express = require("express");
const router = express.Router();

const {
  exportWeeklyRegister,
  listRegisterMonths,
  exportMonthlyRegister,
  exportTermRegister,
} = require("../controllers/gradeRegisterController");

const { protect, authorize } = require("../middleware/authMiddleware");

// The school months (four school weeks each) the app offers for the month
// sheet.
router.get("/months", protect, authorize("teacher"), listRegisterMonths);

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
