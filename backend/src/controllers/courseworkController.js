const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const Attendance = require("../models/Attendance");
const Homework = require("../models/Homework");
const HomeworkResult = require("../models/HomeworkResult");
const MonthlyGrade = require("../models/MonthlyGrade");
const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const ClassworkNotebook = require("../models/ClassworkNotebook");
const User = require("../models/User");
const { getCurrentTermWindow } = require("../utils/termWindow");

const round1 = (n) =>
  n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10) / 10;

// The auto-computed slices of "أعمال السنة" for the current term — الحضور
// والواجب واختبار الشهر تُحسب من سجلات فعلية (حضور/واجبات/درجات شهرية).
// التقييم الأسبوعي وكراسة الحصة (10 و5) هما الاثنين الوحيدين اللي المعلم
// بيسجلهم يدويًا أسبوع بأسبوع (انظر weeklyEvaluationController و
// classworkNotebookController) — لكن متوسطهم على مدار الترم بيتحسب هنا
// زي باقي الأعمدة عشان يبان في مكان واحد.
exports.getClassroomCoursework = async (req, res) => {
  try {
    const { classroomId } = req.params;

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res
        .status(404)
        .json({ success: false, message: "الفصل غير موجود." });
    }

    const teacher = await User.findById(req.user.id);
    const subjectId = teacher.subject;

    const { dateStart, dateEnd, monthYearPairs } = getCurrentTermWindow(
      classroom.academicYear,
    );

    const students = await Student.find({
      classroom: classroomId,
      active: true,
    })
      .select("firstName lastName")
      .sort({ firstName: 1 });

    const studentIds = students.map((s) => s._id);

    // ---- مواظبة وسلوك: (نسبة الحضور × 3) + 2 ----
    const attendanceRecords = await Attendance.find({
      student: { $in: studentIds },
      subject: subjectId,
      date: { $gte: dateStart, $lte: dateEnd },
    }).select("student status");

    const attendanceByStudent = new Map();
    attendanceRecords.forEach((record) => {
      const key = record.student.toString();
      if (!attendanceByStudent.has(key)) {
        attendanceByStudent.set(key, { total: 0, attended: 0 });
      }
      const bucket = attendanceByStudent.get(key);
      bucket.total += 1;
      if (record.status === "present" || record.status === "late") {
        bucket.attended += 1;
      }
    });

    // ---- الواجب المنزلي: (مجموع الدرجات ÷ مجموع الحد الأقصى) × 5 ----
    const homeworks = await Homework.find({
      classroom: classroomId,
      subject: subjectId,
      dueDate: { $gte: dateStart, $lte: dateEnd },
    }).select("_id totalMarks");

    const homeworkIds = homeworks.map((h) => h._id);
    const maxMarksByHomework = new Map(
      homeworks.map((h) => [h._id.toString(), h.totalMarks]),
    );
    const termHomeworkMax = homeworks.reduce((sum, h) => sum + h.totalMarks, 0);

    const homeworkResults = await HomeworkResult.find({
      homework: { $in: homeworkIds },
      student: { $in: studentIds },
    }).select("student homework score status");

    const homeworkByStudent = new Map();
    homeworkResults.forEach((record) => {
      const key = record.student.toString();
      if (!homeworkByStudent.has(key)) {
        homeworkByStudent.set(key, 0);
      }
      const earned = record.status === "missing" ? 0 : record.score || 0;
      homeworkByStudent.set(key, homeworkByStudent.get(key) + earned);
    });

    // ---- اختبار الشهر: متوسط شهور الترم اللي اتسجلت (من 15) ----
    const monthlyGrades = await MonthlyGrade.find({
      classroom: classroomId,
      subject: subjectId,
      $or: monthYearPairs,
    }).select("student grade");

    const monthlyByStudent = new Map();
    monthlyGrades.forEach((record) => {
      const key = record.student.toString();
      if (!monthlyByStudent.has(key)) monthlyByStudent.set(key, []);
      monthlyByStudent.get(key).push(record.grade);
    });

    // ---- التقييم الأسبوعي: متوسط أسابيع الترم اللي اتسجلت (من 10) ----
    const weeklyEvaluations = await WeeklyEvaluation.find({
      classroom: classroomId,
      subject: subjectId,
      weekStart: { $gte: dateStart, $lte: dateEnd },
    }).select("student score");

    const weeklyByStudent = new Map();
    weeklyEvaluations.forEach((record) => {
      const key = record.student.toString();
      if (!weeklyByStudent.has(key)) weeklyByStudent.set(key, []);
      weeklyByStudent.get(key).push(record.score);
    });

    // ---- كراسة الحصة: متوسط أسابيع الترم اللي اتسجلت (من 5) ----
    const classworkEntries = await ClassworkNotebook.find({
      classroom: classroomId,
      subject: subjectId,
      weekStart: { $gte: dateStart, $lte: dateEnd },
    }).select("student score");

    const classworkByStudent = new Map();
    classworkEntries.forEach((record) => {
      const key = record.student.toString();
      if (!classworkByStudent.has(key)) classworkByStudent.set(key, []);
      classworkByStudent.get(key).push(record.score);
    });

    const average = (arr) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const data = students.map((student) => {
      const key = student._id.toString();

      const attendance = attendanceByStudent.get(key);
      const attendanceRate = attendance && attendance.total > 0
        ? attendance.attended / attendance.total
        : null;
      const attendanceBehaviorScore =
        attendanceRate === null ? null : round1(attendanceRate * 3 + 2);

      const homeworkEarned = homeworkByStudent.get(key) || 0;
      const homeworkScore =
        termHomeworkMax > 0
          ? round1((homeworkEarned / termHomeworkMax) * 5)
          : null;

      const monthlyTestScore = round1(average(monthlyByStudent.get(key) || []));
      // Each week's entry is already a whole number — averaging several of
      // them can still land on a fraction, but the weekly-evaluation column
      // never shows one, so round to the nearest whole number here too.
      const weeklyAverage = average(weeklyByStudent.get(key) || []);
      const weeklyEvalScore =
        weeklyAverage === null ? null : Math.round(weeklyAverage);

      // Same whole-number rounding as weeklyEvalScore — each week's entry
      // is already an integer, but an average of several can land on a
      // fraction, and the classwork-notebook column never shows one.
      const classworkAverage = average(classworkByStudent.get(key) || []);
      const classworkNotebookScore =
        classworkAverage === null ? null : Math.round(classworkAverage);

      const subtotal = [
        attendanceBehaviorScore,
        homeworkScore,
        monthlyTestScore,
        weeklyEvalScore,
        classworkNotebookScore,
      ]
        .filter((v) => v !== null && !Number.isNaN(v))
        .reduce((a, b) => a + b, 0);

      return {
        studentId: student._id,
        firstName: student.firstName,
        lastName: student.lastName,
        attendanceRate:
          attendanceRate === null ? null : round1(attendanceRate * 100),
        attendanceBehaviorScore,
        homeworkScore,
        monthlyTestScore,
        weeklyEvalScore,
        classworkNotebookScore,
        subtotal: round1(subtotal),
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        students: data,
        maxScores: {
          attendanceBehaviorScore: 5,
          homeworkScore: 5,
          monthlyTestScore: 15,
          weeklyEvalScore: 10,
          classworkNotebookScore: 5,
          subtotal: 40,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
