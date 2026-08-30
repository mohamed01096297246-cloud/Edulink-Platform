const express = require("express");
const router = express.Router();

const {
  gradeBulkHomework,

  getParentHomeworkDashboard,

  updateSingleGrade,

  deleteSingleGrade,
} = require("../controllers/homeworkResultController");

const { protect, authorize, requireUserFeature } = require("../middleware/authMiddleware");

router.post(
  "/grade/:homeworkId",
  protect,
  authorize("teacher"),
  requireUserFeature("homeworkGrades"),
  gradeBulkHomework,
);

router.get(
  "/dashboard/:studentId",
  protect,
  authorize("parent", "admin"),
  requireUserFeature("homework"),
  getParentHomeworkDashboard,
);

router.put("/:id", protect, authorize("teacher", "admin"), updateSingleGrade);

router.delete(
  "/:id",
  protect,
  authorize("teacher", "admin"),
  deleteSingleGrade,
);

module.exports = router;
