const express = require("express");
const router = express.Router();
const resultController = require("../controllers/resultController");
const { protect, authorize, requireUserFeature } = require("../middleware/authMiddleware");


router.get(
  "/teacher-grades",
  protect,
  authorize("teacher"),
  resultController.getTeacherGrades,
);
router.get(
  "/grade-filters/:gradeId",
  protect,
  authorize("teacher"),
  resultController.getExamsAndClassroomsByGrade,
);
router.get(
  "/classroom-students/:classroomId",
  protect,
  authorize("teacher"),
  resultController.getClassroomStudentsForMarks,
);


router.post(
  "/single",
  protect,
  authorize("teacher", "admin"),
  requireUserFeature("examGrades"),
  resultController.addGrade,
);
router.post(
  "/add",
  protect,
  authorize("teacher"),
  requireUserFeature("examGrades"),
  resultController.addBulkGrades,
);
router.put(
  "/update/:id",
  protect,
  authorize("admin"),
  resultController.updateGrade,
);
router.delete(
  "/delete/:id",
  protect,
  authorize("admin"),
  resultController.deleteGrade,
);
router.get(
  "/report/:studentId/:examId",
  protect,
  authorize("parent", "admin"),
  requireUserFeature("grades"),
  resultController.getReportCard,
);

module.exports = router;
