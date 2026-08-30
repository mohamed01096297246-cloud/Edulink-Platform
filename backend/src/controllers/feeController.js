const Fee = require("../models/Fee");
const Student = require("../models/Student");
const { scopeFilter, sameSchool, creationSchool } = require("../utils/tenant");

exports.createFee = async (req, res) => {
  try {
    const { student, title, academicYear, totalAmount, discount, dueDate } =
      req.body;
    const school = creationSchool(req);

    if (!school) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to bill.",
      });
    }

    const studentDoc = await Student.findById(student);
    if (!studentDoc || studentDoc.school.toString() !== school.toString()) {
      return res.status(404).json({ message: "student not found" });
    }

    const fee = await Fee.create({
      student,
      school,
      title,
      academicYear,
      totalAmount,
      discount: discount || 0,
      dueDate,
      createdBy: req.user._id,
    });

    res.status(201).json({ message: "Fee record created successfully", fee });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getAllFees = async (req, res) => {
  try {
    const extra = {};
    if (req.query.status) extra.status = req.query.status;
    if (req.query.academicYear) extra.academicYear = req.query.academicYear;

    const filter = scopeFilter(req, extra);
    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to list its fees.",
      });
    }

    const fees = await Fee.find(filter)
      .populate("student", "firstName lastName grade classroom")
      .sort({ dueDate: 1 });

    res.status(200).json({ success: true, count: fees.length, data: fees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStudentFees = async (req, res) => {
  try {
    const { studentId } = req.params;
    const studentDoc = await Student.findById(studentId);

    if (!studentDoc || !sameSchool(req, studentDoc)) {
      return res.status(404).json({ message: "student not found" });
    }

    const fees = await Fee.find({ student: studentId }).sort({ dueDate: 1 });

    res.status(200).json({ success: true, data: fees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.recordPayment = async (req, res) => {
  try {
    const { amount, method, note } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "a positive amount is required" });
    }

    const fee = await Fee.findById(req.params.id);
    if (!fee || !sameSchool(req, fee)) {
      return res.status(404).json({ message: "fee record not found" });
    }

    fee.payments.push({
      amount,
      method: method || "cash",
      note,
      recordedBy: req.user._id,
    });

    await fee.save();

    res.status(200).json({ message: "Payment recorded successfully", fee });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteFee = async (req, res) => {
  try {
    const fee = await Fee.findById(req.params.id);
    if (!fee || !sameSchool(req, fee)) {
      return res.status(404).json({ message: "fee record not found" });
    }

    await fee.deleteOne();

    res.status(200).json({ message: "Fee record deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Gives the admin the one screen that answers "are we getting paid" —
// totals across every fee record for their school, plus who's overdue.
exports.getFinancialSummary = async (req, res) => {
  try {
    const filter = scopeFilter(req);
    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) for this summary.",
      });
    }

    const fees = await Fee.find(filter).populate(
      "student",
      "firstName lastName",
    );

    let totalBilled = 0;
    let totalCollected = 0;
    const defaulters = [];
    const now = new Date();

    for (const fee of fees) {
      const owed = fee.totalAmount - fee.discount;
      const paid = fee.payments.reduce((sum, p) => sum + p.amount, 0);

      totalBilled += owed;
      totalCollected += paid;

      if (fee.status !== "paid" && fee.dueDate < now) {
        defaulters.push({
          feeId: fee._id,
          student: fee.student,
          title: fee.title,
          dueDate: fee.dueDate,
          remaining: owed - paid,
        });
      }
    }

    res.status(200).json({
      totalBilled,
      totalCollected,
      totalOutstanding: totalBilled - totalCollected,
      defaultersCount: defaulters.length,
      defaulters,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
