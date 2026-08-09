const express = require("express");
const router = express.Router();
const teacherController = require("../controllers/teacherController");
const { getTeacherDashboard } = require("../controllers/teacherController");
const {
  updateTeacher,
  deleteTeacher,
} = require("../controllers/teacherController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.post("/", protect, authorize("admin"), teacherController.createTeacher);
router.get("/", protect, authorize("admin"), teacherController.getAllTeachers);
router.get("/dashboard", protect, authorize("teacher"), getTeacherDashboard);
router.put("/:id", protect, authorize("admin"), updateTeacher);
router.delete("/:id", protect, authorize("admin", "sub-admin"), deleteTeacher);

module.exports = router;
