const express = require("express");
const router = express.Router();

const {
  createBoardNote,
  getClassroomBoardNotes,
  getStudentBoardNotes,
  getBoardNoteImage,
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

// Any signed-in member of the school can fetch the bytes; the controller
// enforces that it is *their* school. Teachers, parents and admins all
// legitimately view these images.
router.get("/:id/image", protect, getBoardNoteImage);

router.delete("/:id", protect, authorize("teacher", "admin"), deleteBoardNote);

module.exports = router;
