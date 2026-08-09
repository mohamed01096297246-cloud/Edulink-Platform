const express = require("express");
const router = express.Router();

const {
  gradeBulkHomework,

  getParentHomeworkDashboard,

  updateSingleGrade,

  deleteSingleGrade,
} = require("../controllers/homeworkResultController");

const { protect, authorize } = require("../middleware/authMiddleware");

router.post(
  "/grade/:homeworkId",
  protect,
  authorize("teacher"),
  gradeBulkHomework,
);

router.get(
  "/dashboard/:studentId",
  protect,
  authorize("parent", "admin"),
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
