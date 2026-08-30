const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");
const { protect, authorize, requireFeature } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"), requireFeature("examAnalytics"));

router.get("/exams", analyticsController.getExamAnalytics);

module.exports = router;
