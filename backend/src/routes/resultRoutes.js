const express = require("express");
const router = express.Router();
const resultController = require("../controllers/resultController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.post("/add", protect, authorize("teacher"), resultController.addBulkGrades);

router.put("/update/:id", protect, authorize("teacher"), resultController.updateGrade);

router.delete("/delete/:id", protect, authorize("teacher", "admin"), resultController.deleteGrade);

router.get("/report/:studentId/:examId", protect, authorize("parent", "admin", "teacher"), resultController.getReportCard);

module.exports = router;