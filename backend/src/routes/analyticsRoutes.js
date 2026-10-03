const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");
const { getGradeEntry } = require("../controllers/gradeEntryController");
const { protect, authorize, requireFeature } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"), requireFeature("examAnalytics"));

router.get("/exams", analyticsController.getExamAnalytics);
router.get("/grade-entry", getGradeEntry);

module.exports = router;
