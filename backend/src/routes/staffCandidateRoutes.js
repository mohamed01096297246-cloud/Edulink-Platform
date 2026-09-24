const express = require("express");
const router = express.Router();
const { searchStaffCandidates } = require("../controllers/staffCandidateController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/search", protect, authorize("admin"), searchStaffCandidates);

module.exports = router;
