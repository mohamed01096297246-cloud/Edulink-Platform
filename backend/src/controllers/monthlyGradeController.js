const mongoose = require("mongoose");
const MonthlyGrade = require("../models/MonthlyGrade");
const Schedule = require("../models/Schedule");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const User = require("../models/User");

// The school year's real teaching months, in chronological order — Term 1
// runs September through January, Term 2 runs February through May. A
// teacher can freely pick any of these when recording a month's grade
// (there's no "current month" auto-lock), but never a month outside this
// list.
const TERM_MONTHS = {
  1: [9, 10, 11, 12, 1],
  2: [2, 3, 4, 5],
};

const ALL_SCHOOL_MONTHS = [...TERM_MONTHS[1], ...TERM_MONTHS[2]];

const MONTH_NAMES = [
  "", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

// A classroom's `academicYear` is stored as "2025/2026" — September through
// December falls in the first calendar year, January through May falls in
// the second, so the same "month 1" for two different classrooms is never
// ambiguous even though both terms can span a calendar-year boundary.
const yearForMonth = (month, academicYear) => {
  const [yearStart, yearEnd] = academicYear.split("/").map(Number);
  return month >= 9 ? yearStart : yearEnd;
};

const isValidMonth = (month) => ALL_SCHOOL_MONTHS.includes(Number(month));

// Classrooms this teacher actually teaches within the given grade — same
// source of truth as the homework/exam-grades screens (the teacher's own
// Schedule entries), so a teacher can only ever pick a classroom they're
// really assigned to.
exports.getClassroomsForGrade = async (req, res) => {
  try {
    const { gradeId } = req.params;

    const schedules = await Schedule.find({ teacher: req.user.id }).populate({
      path: "classroom",
      match: { grade: new mongoose.Types.ObjectId(gradeId) },
    });

    const classroomsMap = new Map();
    schedules.forEach((sch) => {
      if (sch.classroom) {
        classroomsMap.set(sch.classroom._id.toString(), sch.classroom);
      }
    });

    return res.status(200).json({
      success: true,
      data: Array.from(classroomsMap.values()),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Prefill support: the grades this teacher already entered for this
// classroom in the chosen month, keyed by student id, so re-opening the
// screen shows what was saved instead of a blank sheet.
exports.getClassroomMonthlyGrades = async (req, res) => {
  try {
    const { classroomId } = req.params;
    const { month } = req.query;

    if (!isValidMonth(month)) {
      return res.status(400).json({
        success: false,
        message: "اختر شهرًا صحيحًا من شهور الدراسة.",
      });
    }

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ success: false, message: "الفصل غير موجود." });
    }

    const teacher = await User.findById(req.user.id);
    const year = yearForMonth(Number(month), classroom.academicYear);

    const students = await Student.find({ classroom: classroomId })
      .select("firstName lastName gender")
      .sort({ firstName: 1 });

    const grades = await MonthlyGrade.find({
      classroom: classroomId,
      subject: teacher.subject,
      month: Number(month),
      year,
    });

    const gradesMap = {};
    grades.forEach((g) => {
      gradesMap[g.student.toString()] = g.grade;
    });

    return res.status(200).json({
      success: true,
      data: { students, grades: gradesMap, month: Number(month), year },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveBulkMonthlyGrades = async (req, res) => {
  try {
    const { classroomId, month, gradesList } = req.body;

    if (!classroomId) {
      return res
        .status(400)
        .json({ success: false, message: "اختر الفصل الأول." });
    }

    if (!isValidMonth(month)) {
      return res.status(400).json({
        success: false,
        message: "اختر شهرًا صحيحًا من شهور الدراسة.",
      });
    }

    if (!gradesList || gradesList.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "أدخل درجة طالب واحد على الأقل." });
    }

    const hasInvalidScore = gradesList.some(
      (record) =>
        Number.isNaN(Number(record.grade)) ||
        record.grade < 0 ||
        record.grade > 15,
    );

    if (hasInvalidScore) {
      return res
        .status(400)
        .json({ success: false, message: "الدرجات لازم تكون بين 0 و15." });
    }

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ success: false, message: "الفصل غير موجود." });
    }

    const teacher = await User.findById(req.user.id);
    const year = yearForMonth(Number(month), classroom.academicYear);

    const bulkOps = gradesList.map((record) => ({
      updateOne: {
        filter: {
          student: record.studentId,
          subject: teacher.subject,
          month: Number(month),
          year,
        },
        update: {
          $set: {
            grade: record.grade,
            classroom: classroomId,
            teacher: req.user.id,
            school: req.user.school,
          },
        },
        upsert: true,
      },
    }));

    await MonthlyGrade.bulkWrite(bulkOps);

    return res.status(200).json({
      success: true,
      message: `تم حفظ درجات اختبار شهر ${MONTH_NAMES[Number(month)]} بنجاح`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

