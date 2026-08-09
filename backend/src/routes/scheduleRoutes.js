const express = require("express");
const router = express.Router();
const scheduleController = require("../controllers/scheduleController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.post("/", protect, authorize("admin"), scheduleController.createSchedule);

router.get("/", protect, authorize("admin", "teacher", "parent"), scheduleController.getAllSchedules);

router.get("/teacher/:id", protect, authorize("admin", "teacher"), scheduleController.getTeacherSchedule);

router.get("/class/:classroom", protect, authorize("admin", "teacher", "parent"), scheduleController.getClassSchedule);

router.get("/current", protect, authorize("teacher"), scheduleController.getCurrentClass);

router.delete("/:id", protect, authorize("admin"), scheduleController.deleteSchedule);

router.put("/:id", protect, authorize("admin"), scheduleController.updateSchedule);


module.exports = router;