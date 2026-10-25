const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const { getOptions, getWeek, saveWeek, getTest, saveTest } = require("../controllers/adminMarksController");

// رصد الدرجات من الإدارة — only where the platform owner turned it on for
// the school (School.features.adminMarks), which is off by default; the
// platform owner may open it for any school with ?school=.
const requireAdminMarks = (req, res, next) => {
  if (req.user?.isSuperAdmin || req.userSchool?.features?.adminMarks === true) return next();
  return res.status(403).json({
    success: false,
    message: "رصد الدرجات من الإدارة مش مفعّل لمدرستك. تواصل مع إدارة المنصة لتفعيله.",
  });
};

router.use(protect, authorize("admin"), requireAdminMarks);

router.get("/options", getOptions);
router.get("/week", getWeek);
router.put("/week", saveWeek);
router.get("/test", getTest);
router.put("/test", saveTest);

module.exports = router;
