const express = require("express");
const router = express.Router();
const {
  searchStaffCandidates,
  listStaffAccounts,
  issueStaffAccounts,
  reissueStaffPassword,
} = require("../controllers/staffCandidateController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/search", protect, authorize("admin"), searchStaffCandidates);

// Coded teacher accounts, issued off the list in bulk.
router.get("/accounts", protect, authorize("admin"), listStaffAccounts);
router.post("/accounts/issue", protect, authorize("admin"), issueStaffAccounts);
router.post("/accounts/:id/reissue", protect, authorize("admin"), reissueStaffPassword);

module.exports = router;
