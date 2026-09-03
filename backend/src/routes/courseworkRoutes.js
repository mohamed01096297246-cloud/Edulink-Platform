const express = require("express");
const router = express.Router();

const { getClassroomCoursework } = require("../controllers/courseworkController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get(
  "/classroom/:classroomId",
  protect,
  authorize("teacher"),
  getClassroomCoursework,
);

module.exports = router;
