const mongoose = require("mongoose");
const Behavior = require("../models/Behavior");
const Student = require("../models/Student");
const Schedule = require("../models/Schedule");
const { scopeFilter } = require("../utils/tenant");


exports.recordBulkBehavior = async (req, res) => {
  try {
    const { scheduleId, behaviorRecords, selectedDate } = req.body;

    if (!scheduleId || !selectedDate) {
      return res.status(400).json({
        success: false,
        message: "بيانات ناقصة (رقم الحصة أو التاريخ).",
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
        message: "لم يتم العثور على هذه الحصة.",
      });
    }

    if (!currentSchedule.subject || !currentSchedule.classroom) {
      return res.status(422).json({
        success: false,
        message: "بيانات هذه الحصة ناقصة (المادة أو الفصل).",
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
          "لازم تختار نوع السلوك وتكتب ملاحظة لطالب واحد على الأقل.",
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
          "تم تسجيل سلوك هذه الحصة بالفعل النهاردة.",
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
      school: req.user.school,
    }));

    const result = await Behavior.insertMany(bulkData, { ordered: false });

    return res.status(201).json({
      success: true,
      message: `تم تسجيل تقييم السلوك لـ ${result.length} طالب بنجاح.`,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "تم تجاهل بعض السجلات لأنها مسجّلة بالفعل لهذا الطالب النهاردة.",
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
        .json({ success: false, message: "بيانات ناقصة." });
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
    const filter = scopeFilter(
      req,
      req.user.role === "teacher" ? { teacher: req.user.id } : {},
    );

    if (!filter) {
      return res.status(400).json({
        message: "برجاء تحديد مدرسة (?school=id) لعرض سجلات السلوك.",
      });
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
        .json({ success: false, message: "الطالب غير موجود" });
    }

    if (
      req.user.role === "parent" &&
      student.parent.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بعرض سجلات هذا الطالب.",
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
        .json({ success: false, message: "سجل السلوك غير موجود" });
    }

    if (
      req.user.role === "teacher" &&
      behavior.teacher.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "عذرًا، غير مصرح لك بحذف سجل معلم آخر.",
      });
    }

    await behavior.deleteOne();
    res.json({ success: true, message: "تم حذف السجل بنجاح." });
  } catch (err) {
    console.error("Delete Behavior Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
