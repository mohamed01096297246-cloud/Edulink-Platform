const express = require("express");
const router = express.Router();

const {
  getParentDashboard,
  getStudentReport,
} = require("../controllers/parentController");
const { protect, authorize, requireUserFeature } = require("../middleware/authMiddleware");

router.get("/dashboard", protect, authorize("parent"), getParentDashboard);
router.get(
  "/report/:studentId",
  protect,
  authorize("parent"),
  requireUserFeature("report"),
  getStudentReport
);

module.exports = router;