const express = require("express");
const router = express.Router();
const { searchCandidates } = require("../controllers/admissionCandidateController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/search", protect, authorize("admin"), searchCandidates);

module.exports = router;
