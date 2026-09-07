const express = require("express");
const router = express.Router();

const {
  startCoverSession,
  getMyCoverSessions,
  getCoverSessionRoster,
} = require("../controllers/coverSessionController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.post("/", protect, authorize("teacher"), startCoverSession);
router.get("/mine", protect, authorize("teacher"), getMyCoverSessions);
router.get("/:id/roster", protect, authorize("teacher"), getCoverSessionRoster);

module.exports = router;
