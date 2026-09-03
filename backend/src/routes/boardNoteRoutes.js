const express = require("express");
const router = express.Router();

const {
  createBoardNote,
  getClassroomBoardNotes,
  getStudentBoardNotes,
  deleteBoardNote,
} = require("../controllers/boardNoteController");

const { protect, authorize, requireUserFeature } = require("../middleware/authMiddleware");
const { uploadBoardNoteImage } = require("../middleware/upload");

router.post(
  "/",
  protect,
  authorize("teacher"),
  uploadBoardNoteImage,
  createBoardNote,
);

router.get(
  "/classroom/:classroomId",
  protect,
  authorize("teacher"),
  getClassroomBoardNotes,
);

router.get(
  "/student/:studentId",
  protect,
  authorize("parent", "admin"),
  requireUserFeature("homework"),
  getStudentBoardNotes,
);

router.delete("/:id", protect, authorize("teacher", "admin"), deleteBoardNote);

module.exports = router;
