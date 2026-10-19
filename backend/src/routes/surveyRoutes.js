const express = require("express");
const router = express.Router();
const survey = require("../controllers/surveyController");
const { protect, requireSuperAdmin } = require("../middleware/authMiddleware");

// Answered from a link with no login.
router.get("/public/:slug", survey.getPublicSurvey);
router.post("/public/:slug/responses", survey.submitResponse);

// The platform owner, per school (the schools page).
router.get("/school/:schoolId", protect, requireSuperAdmin, survey.getSchoolSurvey);
router.post("/school/:schoolId", protect, requireSuperAdmin, survey.createSchoolSurvey);
router.put("/school/:schoolId", protect, requireSuperAdmin, survey.updateSchoolSurvey);

module.exports = router;
