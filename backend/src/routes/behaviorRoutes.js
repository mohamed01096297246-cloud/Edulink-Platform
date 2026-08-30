const express = require("express");
const router = express.Router();
const behaviorController = require("../controllers/behaviorController");
const { protect, authorize, requireFeature, requireUserFeature } = require("../middleware/authMiddleware");

router.use(protect, requireFeature("behavior"), requireUserFeature("behavior"));

router.get(
  "/check",
  authorize("teacher"),
  behaviorController.checkExistingBehavior,
);

router.post(
  "/bulk",
  authorize("teacher"),
  behaviorController.recordBulkBehavior,
);

router.get(
  "/",
  authorize("teacher", "admin"),
  behaviorController.getAllBehavior,
);

router.get(
  "/student/:studentId",
  authorize("teacher", "admin", "parent"),
  behaviorController.getStudentBehavior,
);

router.delete(
  "/:id",
  authorize("admin", "teacher"),
  behaviorController.deleteBehavior,
);

module.exports = router;
