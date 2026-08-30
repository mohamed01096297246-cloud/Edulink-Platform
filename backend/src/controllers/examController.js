const Exam = require("../models/Exam");
const Student = require("../models/Student");
const User = require("../models/User");
const { scopeFilter, sameSchool, creationSchool } = require("../utils/tenant");

exports.createExamSchedule = async (req, res) => {
  try {
    const { title, examType, academicYear, grade, timetable } = req.body;
    const school = creationSchool(req);

    if (!school) {
      return res.status(400).json({
        message: "برجاء تحديد مدرسة (?school=id) لإنشاء جدول امتحانات.",
      });
    }

    const exam = await Exam.create({
      title,
      examType,
      academicYear,
      grade,
      timetable,
      school,
    });
    res.status(201).json({
      success: true,
      message: "تم إنشاء جدول الامتحانات بنجاح",
      data: exam,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getAllExams = async (req, res) => {
  try {
    const filter = scopeFilter(req);

    if (!filter) {
      return res.status(400).json({
        message: "برجاء تحديد مدرسة (?school=id) لعرض الامتحانات.",
      });
    }

    const exams = await Exam.find(filter)
      .populate("grade", "name academicYear")
      .populate("timetable.subject", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: exams.length, data: exams });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.getTeacherExams = async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id).populate("classrooms");

    if (!teacher) return res.status(404).json({ message: "المعلم غير موجود" });

    const gradeIds = [...new Set(teacher.classrooms.map((c) => c.grade))];
    const exams = await Exam.find({
      grade: { $in: gradeIds },
      school: req.user.school,
    })
      .populate("grade", "name academicYear")
      .populate("timetable.subject", "name");
    res.status(200).json({
      success: true,
      count: exams.length,
      data: exams,
    });
  } catch (err) {
    console.error("Error in getTeacherExams:", err);
    res.status(500).json({ message: err.message });
  }
};

exports.getStudentExams = async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: "الطالب غير موجود" });

    if (
      req.user.role === "parent" &&
      student.parent.toString() !== req.user.id
    ) {
      return res.status(403).json({
        message: "غير مصرح لك بعرض امتحانات هذا الطالب",
      });
    }

    const exams = await Exam.find({
      grade: student.grade,
      school: student.school,
    })
      .populate("grade", "name academicYear")
      .populate("timetable.subject", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: exams });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.updateExamSchedule = async (req, res) => {
  try {
    const examId = req.params.id;

    const existing = await Exam.findById(examId);
    if (!existing || !sameSchool(req, existing)) {
      return res.status(404).json({ message: "جدول الامتحانات غير موجود" });
    }

    const updatedExam = await Exam.findByIdAndUpdate(examId, req.body, {
      new: true,
      runValidators: true,
    })
      .populate("grade", "name academicYear")
      .populate("timetable.subject", "name");

    res.status(200).json({
      success: true,
      message: "تم تحديث جدول الامتحانات بنجاح",
      data: updatedExam,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
exports.deleteExamSchedule = async (req, res) => {
  try {
    const examId = req.params.id;

    const exam = await Exam.findById(examId);

    if (!exam || !sameSchool(req, exam)) {
      return res.status(404).json({ message: "جدول الامتحانات غير موجود" });
    }

    await exam.deleteOne();

    res.status(200).json({
      success: true,
      message: "تم حذف جدول الامتحانات بنجاح",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
