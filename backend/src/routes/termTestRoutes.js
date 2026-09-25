const express = require("express");
const router = express.Router();
const {
  getClassroomTermTests,
  saveBulkTermTests,
} = require("../controllers/termTestController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/classroom/:classroomId", protect, authorize("teacher"), getClassroomTermTests);
router.post("/bulk", protect, authorize("teacher"), saveBulkTermTests);

module.exports = router;
