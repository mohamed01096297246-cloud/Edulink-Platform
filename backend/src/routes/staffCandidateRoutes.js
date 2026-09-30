const express = require("express");
const router = express.Router();
const {
  searchStaffCandidates,
  listStaffAccounts,
  issueStaffAccounts,
  reissueStaffPassword,
  issueTeacherLogin,
} = require("../controllers/staffCandidateController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/search", protect, authorize("admin"), searchStaffCandidates);

// Coded teacher accounts, issued off the list in bulk.
router.get("/accounts", protect, authorize("admin"), listStaffAccounts);
router.post("/accounts/issue", protect, authorize("admin"), issueStaffAccounts);
router.post("/accounts/:id/reissue", protect, authorize("admin"), reissueStaffPassword);
// A teacher registered from the form rather than the list.
router.post("/teachers/:id/login", protect, authorize("admin"), issueTeacherLogin);

module.exports = router;
