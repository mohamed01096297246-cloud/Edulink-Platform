const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const { getOptions, list, takeOff, putBack } = require("../controllers/markingSkipController");

// «رفع بند من الرصد» — every school's admins (controllers/markingSkipController.js).
router.use(protect, authorize("admin"));

router.get("/options", getOptions);
router.get("/", list);
router.put("/", takeOff);
router.delete("/:id", putBack);

module.exports = router;
