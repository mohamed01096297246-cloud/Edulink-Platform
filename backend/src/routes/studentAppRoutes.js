const express = require("express");
const router = express.Router();
const {
  getToday,
  getSchedule,
  getHomework,
  getGrades,
  getPerformance,
} = require("../controllers/studentAppController");
const { protect, authorize } = require("../middleware/authMiddleware");

// A student reads their own record and nothing else — which student is
// taken from the account on the token, never from the request, so there is
// no id here for anyone to change.
router.use(protect, authorize("student"));

router.get("/today", getToday);
router.get("/schedule", getSchedule);
router.get("/homework", getHomework);
router.get("/grades", getGrades);
router.get("/performance", getPerformance);

module.exports = router;
