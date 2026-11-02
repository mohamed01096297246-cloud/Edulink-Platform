const express = require("express");
const router = express.Router();

const {
  exportWeeklyRegister,
  listRegisterMonths,
  exportMonthlyRegister,
  exportTermRegister,
  registerDownloadLink,
} = require("../controllers/gradeRegisterController");

const { protect, authorize } = require("../middleware/authMiddleware");
const { acceptLink } = require("../utils/downloadLink");

// The school months (four school weeks each) the app offers for the month
// sheet.
router.get("/months", protect, authorize("teacher"), listRegisterMonths);

// A link the phone's browser downloads the register from (Android app).
router.get("/link", protect, authorize("teacher"), registerDownloadLink);

router.get(
  "/week/:classroomId",
  acceptLink,
  protect,
  authorize("teacher"),
  exportWeeklyRegister,
);

router.get(
  "/month/:classroomId",
  acceptLink,
  protect,
  authorize("teacher"),
  exportMonthlyRegister,
);

// أعمال السنة for a whole term — weekly40 classrooms only.
router.get(
  "/term/:classroomId",
  acceptLink,
  protect,
  authorize("teacher"),
  exportTermRegister,
);

module.exports = router;
