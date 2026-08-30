const express = require("express");
const router = express.Router();
const schoolController = require("../controllers/schoolController");
const { protect, requireSuperAdmin } = require("../middleware/authMiddleware");

// Platform-level only — a school's own admin never touches these routes,
// they only ever operate on the school they belong to.
router.use(protect, requireSuperAdmin);

router.get("/overview", schoolController.getPlatformOverview);
router.get("/", schoolController.getAllSchools);
router.post("/", schoolController.createSchool);
router.put("/:id", schoolController.updateSchool);
router.delete("/:id", schoolController.deleteSchool);
router.post("/:schoolId/admin", schoolController.createSchoolAdmin);

module.exports = router;
