const express = require("express");
const router = express.Router();

const examController = require("../controllers/examController");

const { protect, authorize, requireUserFeature } = require("../middleware/authMiddleware");


router.post("/", protect, authorize("admin"), examController.createExamSchedule);

router.get("/teacher-exams", protect, authorize("teacher"), examController.getTeacherExams);

router.get("/", protect, authorize("admin", "teacher"), examController.getAllExams);

router.put("/:id", protect, authorize("admin"), examController.updateExamSchedule);

router.delete("/:id", protect, authorize("admin"), examController.deleteExamSchedule);

router.get("/student/:studentId", protect, authorize("parent", "admin"), requireUserFeature("exams"), examController.getStudentExams);

module.exports = router;