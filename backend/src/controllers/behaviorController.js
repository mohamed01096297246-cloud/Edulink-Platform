const mongoose = require("mongoose");
const Behavior = require("../models/Behavior");
const Student = require("../models/Student");
const Schedule = require("../models/Schedule");


exports.recordBulkBehavior = async (req, res) => {
  try {
    const { scheduleId, behaviorRecords, selectedDate } = req.body;

    if (!scheduleId || !selectedDate) {
      return res.status(400).json({
        success: false,
        message: "Required parameters (scheduleId, selectedDate) are missing.",
      });
    }

    const currentSchedule = await Schedule.findById(scheduleId);

    if (!currentSchedule) {
      console.log(
        "CRITICAL ERROR: Could not find schedule with ID:",
        scheduleId,
      );
      return res.status(404).json({
        success: false,
        message: `Schedule not found. The ID sent was: ${scheduleId}`,
      });
    }

    if (!currentSchedule.subject || !currentSchedule.classroom) {
      return res.status(422).json({
        success: false,
        message: "Schedule is missing subject or classroom information.",
      });
    }

    const [year, month, day] = selectedDate.split("-").map(Number);
    const pureDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

    const validRecords = (behaviorRecords || []).filter(
      (r) => r.type && r.note && r.note.trim().length > 0,
    );

    if (validRecords.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "You must select a behavior type and write a note for at least one student.",
      });
    }


    const existingBehavior = await Behavior.findOne({
      teacher: new mongoose.Types.ObjectId(req.user.id),
      subject: currentSchedule.subject,
      classroom: currentSchedule.classroom,
      date: pureDate,
    });

    if (existingBehavior) {
      return res.status(409).json({
        success: false,
        message:
          "Behavior logs for this session have already been recorded today.",
      });
    }

    const bulkData = validRecords.map((record) => ({
      student: new mongoose.Types.ObjectId(record.studentId),
      teacher: new mongoose.Types.ObjectId(req.user.id),
      subject: currentSchedule.subject,
      classroom: currentSchedule.classroom,
      type: record.type,
      note: record.note.trim(),
      date: pureDate,
    }));

    const result = await Behavior.insertMany(bulkData, { ordered: false });

    return res.status(201).json({
      success: true,
      message: `Successfully recorded behavior evaluations for ${result.length} students.`,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Some records were skipped because they already exist for this student today.",
      });
    }
    console.error("Behavior Bulk Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};


exports.checkExistingBehavior = async (req, res) => {
  try {
    const { classroomId, date } = req.query;

    if (!classroomId || !date) {
      return res
        .status(400)
        .json({ success: false, message: "Missing parameters." });
    }

    const currentSchedule = await Schedule.findById(classroomId);
    if (!currentSchedule) {
      return res.json({ success: true, exists: false, records: [] });
    }
    const [year, month, day] = date.split("-").map(Number);
    const pureDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

    const records = await Behavior.find({
      teacher: new mongoose.Types.ObjectId(req.user.id),
      subject: currentSchedule.subject,
      classroom: currentSchedule.classroom,
      date: pureDate,
    }).populate("student", "firstName lastName");

    return res.json({
      success: true,
      exists: records.length > 0,
      records,
    });
  } catch (err) {
    console.error("Check Behavior Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllBehavior = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === "teacher") {
      filter = { teacher: req.user.id };
    }

    const data = await Behavior.find(filter)
      .populate({
        path: "student",
        select: "firstName lastName",
      })
      .populate("teacher", "firstName lastName")
      .populate("subject", "name")
      .populate("classroom", "name") 
      .sort({ createdAt: -1 });

    res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error("Get All Behavior Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getStudentBehavior = async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findById(studentId);
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });
    }

    if (
      req.user.role === "parent" &&
      student.parent.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Access denied to view this student's records.",
      });
    }

    const data = await Behavior.find({ student: studentId })
      .populate("teacher", "firstName lastName")
      .populate("subject", "name")
      .populate("classroom", "name") 
      .sort({ date: -1 });

    res.json({ success: true, data });
  } catch (err) {
    console.error("Get Student Behavior Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteBehavior = async (req, res) => {
  try {
    const behavior = await Behavior.findById(req.params.id);
    if (!behavior) {
      return res
        .status(404)
        .json({ success: false, message: "Behavior record not found" });
    }

    if (
      req.user.role === "teacher" &&
      behavior.teacher.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "sorry, you are not authorized to delete another teacher's record.",
      });
    }

    await behavior.deleteOne();
    res.json({ success: true, message: "Record deleted successfully." });
  } catch (err) {
    console.error("Delete Behavior Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
