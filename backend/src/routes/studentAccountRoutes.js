const express = require("express");
const router = express.Router();
const {
  listStudentAccounts,
  issueStudentAccounts,
  reissueStudentPassword,
  listEligibleGrades,
} = require("../controllers/studentAccountController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"));

router.get("/grades", listEligibleGrades);
router.get("/", listStudentAccounts);
router.post("/issue", issueStudentAccounts);
router.post("/:studentId/reissue", reissueStudentPassword);

module.exports = router;
