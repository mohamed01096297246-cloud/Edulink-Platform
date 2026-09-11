const express = require("express");
const router = express.Router();
const { searchByStudentName } = require("../controllers/contactDirectoryController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/search", protect, authorize("admin"), searchByStudentName);

module.exports = router;
