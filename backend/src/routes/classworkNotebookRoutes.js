const express = require("express");
const router = express.Router();

const {
  getClassroomClassworkNotebook,
  saveBulkClassworkNotebook,
} = require("../controllers/classworkNotebookController");

const { protect, authorize } = require("../middleware/authMiddleware");

router.get(
  "/classroom/:classroomId",
  protect,
  authorize("teacher"),
  getClassroomClassworkNotebook,
);

router.post("/bulk", protect, authorize("teacher"), saveBulkClassworkNotebook);

module.exports = router;
