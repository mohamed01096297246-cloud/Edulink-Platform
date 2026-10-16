const express = require("express");
const router = express.Router();
const teacherController = require("../controllers/teacherController");
const { getTeacherDashboard } = require("../controllers/teacherController");
const {
  updateTeacher,
  deleteTeacher,
} = require("../controllers/teacherController");
const { getMyGradeEntry } = require("../controllers/gradeEntryController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.post("/", protect, authorize("admin"), teacherController.createTeacher);
router.get("/", protect, authorize("admin"), teacherController.getAllTeachers);
router.get("/dashboard", protect, authorize("teacher"), getTeacherDashboard);
router.get(
  "/my-subjects",
  protect,
  authorize("teacher"),
  teacherController.getMySubjects,
);
// «آخر التطورات»: what the teacher has recorded this week and what is left.
router.get("/progress", protect, authorize("teacher"), getMyGradeEntry);
router.put("/:id", protect, authorize("admin"), updateTeacher);
router.delete("/:id", protect, authorize("admin", "sub-admin"), deleteTeacher);

module.exports = router;
