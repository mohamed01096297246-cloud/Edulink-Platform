const express = require("express");
const router = express.Router();

const {
  getBellSchedules,
  createBellSchedule,
  updateBellSchedule,
  deleteBellSchedule,
} = require("../controllers/bellScheduleController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/", protect, authorize("admin"), getBellSchedules);
router.post("/", protect, authorize("admin"), createBellSchedule);
router.put("/:id", protect, authorize("admin"), updateBellSchedule);
router.delete("/:id", protect, authorize("admin"), deleteBellSchedule);

module.exports = router;
