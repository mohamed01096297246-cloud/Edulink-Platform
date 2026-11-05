const mongoose = require("mongoose");
const MonthlyGrade = require("../models/MonthlyGrade");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const User = require("../models/User");
const { requireTeacherSubject } = require("../utils/teacherSubject");
const { teacherClassroomIds, teacherMarkClassroomIds } = require("../utils/teacherClassrooms");
const { rosterWhere } = require("../utils/secondLanguage");
const { marksBefore, tellMarks, noticeValue } = require("../utils/studentNotices");
const { isAbsent, isWithdrawn, readMark, markUpdate } = require("../utils/absentMark");

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
// timetable, plus the classes assigned to them before there was one), so a
// teacher can only ever pick a classroom they're really assigned to.
exports.getClassroomsForGrade = async (req, res) => {
  try {
    const { gradeId } = req.params;

    // `?marks=1`: a marking screen, which leaves out a class where all the
    // teacher takes is taught but not marked (Subject.noMarks).
    const ids =
      req.query.marks === "1"
        ? await teacherMarkClassroomIds(req.user.id)
        : await teacherClassroomIds(req.user.id);
    const data = await Classroom.find({
      _id: { $in: ids },
      grade: new mongoose.Types.ObjectId(gradeId),
    }).sort({ name: 1 });

    return res.status(200).json({
      success: true,
      data,
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
    const subjectId = await requireTeacherSubject(res, {
      teacher,
      classroomId,
      requestedSubjectId: req.query.subjectId,
      marks: true,
    });
    if (!subjectId) return undefined;

    const year = yearForMonth(Number(month), classroom.academicYear);

    const students = await Student.find({
      classroom: classroomId,
      ...(await rosterWhere(classroomId, subjectId)),
    })
      .select("firstName lastName gender")
      .sort({ firstName: 1 });

    const grades = await MonthlyGrade.find({
      classroom: classroomId,
      subject: subjectId,
      month: Number(month),
      year,
    });

    const gradesMap = {};
    // The pupils whose 0 reads «غ», and those whose 0 reads «م»
    // (utils/absentMark.js).
    const absent = {};
    const withdrawn = {};
    grades.forEach((g) => {
      gradesMap[g.student.toString()] = g.grade;
      if (isAbsent(g.absent, g.grade)) absent[g.student.toString()] = true;
      if (isWithdrawn(g.withdrawn, g.grade)) withdrawn[g.student.toString()] = true;
    });

    return res.status(200).json({
      success: true,
      data: { students, grades: gradesMap, absent, withdrawn, month: Number(month), year },
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

    if (!Array.isArray(gradesList) || gradesList.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "أدخل درجة طالب واحد على الأقل." });
    }

    // Any number from 0 to 15, or «غ» / «م» (utils/absentMark.js). A pupil
    // sent with no mark is left as they are.
    const read = gradesList.map((record) => ({ record, mark: readMark(record.grade, 15) }));

    if (read.some(({ mark }) => mark.error)) {
      return res.status(400).json({
        success: false,
        message: "الدرجات لازم تكون رقم بين 0 و15، أو «غ» للغايب، أو «م» للمنقطع.",
      });
    }
    const marked = read.filter(({ mark }) => mark.value !== null);
    if (marked.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "أدخل درجة طالب واحد على الأقل." });
    }

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ success: false, message: "الفصل غير موجود." });
    }

    const teacher = await User.findById(req.user.id);
    const subjectId = await requireTeacherSubject(res, {
      teacher,
      classroomId,
      requestedSubjectId: req.body.subjectId,
      marks: true,
    });
    if (!subjectId) return undefined;

    const year = yearForMonth(Number(month), classroom.academicYear);

    // «غ» and «م» set their flag; a number takes them off, but a 0 from an
    // app that can't send a letter keeps it (utils/absentMark.js).
    const letters = Boolean(req.body.letters);
    const bulkOps = marked.map(({ record, mark }) => ({
      updateOne: {
        filter: {
          student: record.studentId,
          subject: subjectId,
          month: Number(month),
          year,
        },
        update: markUpdate(
          "grade",
          mark,
          { classroom: classroomId, teacher: req.user.id, school: req.user.school },
          letters,
        ),
        upsert: true,
      },
    }));

    // What each student had, to tell only a mark that is new or different.
    const before = marksBefore(
      await MonthlyGrade.find({
        subject: subjectId,
        month: Number(month),
        year,
        student: { $in: marked.map(({ record }) => record.studentId) },
      })
        .select("student grade")
        .lean(),
      (d) => ({ grade: d.grade }),
    );

    await MonthlyGrade.bulkWrite(bulkOps);

    await tellMarks({
      subjectId,
      when: `شهر ${MONTH_NAMES[Number(month)]}`,
      columns: { grade: { label: "الاختبار الشهري", max: 15 } },
      before,
      after: marked.map(({ record, mark }) => ({ studentId: record.studentId, marks: { grade: noticeValue(mark) } })),
      createdBy: req.user.id,
      school: req.user.school,
    });

    return res.status(200).json({
      success: true,
      message: `تم حفظ درجات اختبار شهر ${MONTH_NAMES[Number(month)]} بنجاح`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

