const express = require("express");
const router = express.Router();
const {
  listAssignments,
  setTeacherAssignments,
} = require("../controllers/classAssignmentController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/", protect, authorize("admin"), listAssignments);
router.put("/teacher/:teacherId", protect, authorize("admin"), setTeacherAssignments);

module.exports = router;
