const mongoose = require("mongoose");
const Behavior = require("../models/Behavior");
const Student = require("../models/Student");
const Schedule = require("../models/Schedule");
const Subject = require("../models/Subject");
const { scopeFilter } = require("../utils/tenant");
const { notifyParent } = require("../utils/notify");


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


    // Teachers can re-open and edit a day's behavior report after saving —
    // rather than reject a re-submission, replace that exact
    // teacher/subject/classroom/date's whole record set with the new one.
    // This cleanly covers every edit case (a note reworded, a type flipped,
    // an entry removed) in one atomic pass instead of diffing individually.
    await Behavior.deleteMany({
      teacher: new mongoose.Types.ObjectId(req.user.id),
      subject: currentSchedule.subject,
      classroom: currentSchedule.classroom,
      date: pureDate,
    });

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

    // Best-effort — never blocks the behavior save if a notification fails.
    notifyBehaviorParents(bulkData, currentSchedule.subject, req.user).catch(
      (err) => console.log("Behavior — parent notify error:", err.message),
    );

    return res.status(201).json({
      success: true,
      message: `تم حفظ تقييم السلوك لـ ${result.length} طالب بنجاح.`,
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

// One personalized notice per student — the note text differs per child,
// so this can't go through the same-message-for-everyone broadcast helper.
async function notifyBehaviorParents(bulkData, subjectId, user) {
  const studentIds = bulkData.map((record) => record.student);
  const students = await Student.find({ _id: { $in: studentIds } }).populate(
    "parent",
    "pushToken",
  );
  const studentById = new Map(students.map((s) => [s._id.toString(), s]));
  const subjectDoc = await Subject.findById(subjectId).select("name");

  await Promise.all(
    bulkData.map((record) => {
      const student = studentById.get(record.student.toString());
      if (!student?.parent) return null;

      const typeLabel = record.type === "positive" ? "إيجابي" : "سلبي";

      return notifyParent({
        parentId: student.parent._id,
        pushToken: student.parent.pushToken,
        studentId: student._id,
        type: "behavior",
        title: "ملاحظة سلوك جديدة",
        message: `سلوك ${typeLabel} في مادة ${subjectDoc?.name || ""}: "${record.note}"`,
        school: user.school,
        createdBy: user.id,
      });
    }),
  );
}

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
