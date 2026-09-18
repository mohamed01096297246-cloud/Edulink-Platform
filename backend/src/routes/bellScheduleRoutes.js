const express = require("express");
const router = express.Router();

const {
  getBellSchedules,
  createBellSchedule,
  updateBellSchedule,
  deleteBellSchedule,
} = require("../controllers/bellScheduleController");
const {
  protect,
  authorize,
  requireWholeSchool,
} = require("../middleware/authMiddleware");

// Reading is narrowed to the caller's own stages; writing isn't offered to
// a stage principal at all, since saving bell times is validated against
// every classroom in the school — see requireWholeSchool.
router.get("/", protect, authorize("admin"), getBellSchedules);
router.post("/", protect, authorize("admin"), requireWholeSchool, createBellSchedule);
router.put("/:id", protect, authorize("admin"), requireWholeSchool, updateBellSchedule);
router.delete("/:id", protect, authorize("admin"), requireWholeSchool, deleteBellSchedule);

module.exports = router;
