const express = require("express");
const router = express.Router();
const behaviorController = require("../controllers/behaviorController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get(
  "/check",
  protect,
  authorize("teacher"),
  behaviorController.checkExistingBehavior,
);

router.post(
  "/bulk",
  protect,
  authorize("teacher"),
  behaviorController.recordBulkBehavior,
);

router.get(
  "/",
  protect,
  authorize("teacher", "admin"),
  behaviorController.getAllBehavior,
);

router.get(
  "/student/:studentId",
  protect,
  authorize("teacher", "admin", "parent"),
  behaviorController.getStudentBehavior,
);

router.delete(
  "/:id",
  protect,
  authorize("admin", "teacher"),
  behaviorController.deleteBehavior,
);

module.exports = router;
