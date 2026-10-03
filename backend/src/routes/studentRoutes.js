const express = require("express");
const router = express.Router();

const {
  createStudent,
  getStudents,
  getStudent,
  getStudentsByParent,
  getUnassignedStudents,
  assignStudentsToClassroom,
  updateStudent,
  deleteStudent
} = require("../controllers/studentController");

const { protect, authorize } = require("../middleware/authMiddleware");
const { getStudentRecord } = require("../controllers/studentRecordController");

router.post("/", protect, authorize("admin"), createStudent);
router.post(
  "/assign-classroom",
  protect,
  authorize("admin"),
  assignStudentsToClassroom,
);

router.get("/", protect, authorize("admin", "teacher"), getStudents);
// Must come before "/:id" — otherwise Express reads "unassigned" as an id.
router.get(
  "/unassigned",
  protect,
  authorize("admin"),
  getUnassignedStudents,
);
router.get("/parent/:parentId", protect, getStudentsByParent);
router.get("/:id/record", protect, authorize("admin"), getStudentRecord);
router.get("/:id", protect, getStudent);

router.put("/:id", protect, authorize("admin"), updateStudent);

router.delete("/:id", protect, authorize("admin"), deleteStudent);

module.exports = router;
