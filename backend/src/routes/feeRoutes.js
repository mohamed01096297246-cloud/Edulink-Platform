const express = require("express");
const router = express.Router();
const feeController = require("../controllers/feeController");
const { protect, authorize, requireFeature } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"), requireFeature("fees"));

router.get("/summary", feeController.getFinancialSummary);
router.get("/student/:studentId", feeController.getStudentFees);
router.get("/", feeController.getAllFees);
router.post("/", feeController.createFee);
router.post("/:id/payments", feeController.recordPayment);
router.delete("/:id", feeController.deleteFee);

module.exports = router;
