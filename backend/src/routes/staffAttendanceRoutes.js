const express = require("express");
const router = express.Router();
const staffAttendanceController = require("../controllers/staffAttendanceController");
const { protect, authorize, requireFeature } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"), requireFeature("staffAttendance"));

router.get("/", staffAttendanceController.getStaffAttendance);
router.post("/bulk", staffAttendanceController.recordBulkStaffAttendance);
router.get("/coverage", staffAttendanceController.getCoverageNeeded);
router.post("/substitutions", staffAttendanceController.createSubstitution);
router.delete("/substitutions/:id", staffAttendanceController.deleteSubstitution);

module.exports = router;
