const express = require("express");
const router = express.Router();
const schoolController = require("../controllers/schoolController");
const familyAccess = require("../controllers/familyAccessController");
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

// Linking students to their parents and handing out parents' logins.
router.get("/:schoolId/families", familyAccess.listFamilies);
router.get("/:schoolId/families/parent", familyAccess.lookupParent);
router.post("/:schoolId/families/:studentId/link", familyAccess.linkStudent);
router.post("/:schoolId/families/parents/:parentId/reissue", familyAccess.reissueParentPassword);

module.exports = router;
