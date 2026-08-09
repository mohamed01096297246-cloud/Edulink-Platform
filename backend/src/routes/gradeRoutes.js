const express = require("express");
const router = express.Router();

const {
  createGrade,
  getAllGrades,
  updateGrade,
  deleteGrade,
} = require("../controllers/gradeController");

const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/", protect, getAllGrades);

router.post("/", protect, authorize("admin"), createGrade);
router.put("/:id", protect, authorize("admin"), updateGrade);
router.delete("/:id", protect, authorize("admin"), deleteGrade);

module.exports = router;
